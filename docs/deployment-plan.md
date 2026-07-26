# Deployment Plan — Self-host en OVH (auth + BD + front)

> Plan de despliegue vigente. Sustituye al plan MVP anterior (Vercel + Supabase), que queda solo como el
> entorno **interino de producción** hasta el cutover. Ver el plan de migración completo en
> `/Users/angel/.claude/plans/quiero-que-planees-siempre-snoopy-metcalfe.md`.

## Objetivo

Self-hostear **todo** (auth + base de datos + front) en un **VPS de OVH**, construyéndolo **en paralelo** sin
interrumpir la producción actual (Vercel + Supabase). Al pasar pruebas de paridad, **cutover** a OVH.
Estado final: `main` con **despliegue automático al VPS**.

## Estado actual (interino) vs destino

| | Actual (interino) | Destino (self-host) |
|---|---|---|
| App | Vercel | Next.js en contenedor (OVH) |
| BD | Supabase Postgres | Postgres self-host (contenedor) |
| Auth | Supabase Auth | **Auth propia** (adaptador `AuthPort`, bcrypt) |
| Costo | ~$45/mo | ~$7.50/mo |

## Arquitectura destino

```
OVH VPS-1 (4 vCPU / 8 GB / 75 GB NVMe) — Ubuntu + Dokploy
 ├─ web   (Next.js)          → público (dominio + HTTPS vía Traefik/Let's Encrypt)
 ├─ db    (Postgres)         → red interna, NO expuesto a internet
 └─ (dev) web + db aparte    → dev.tudominio.com (BD dev separada)
```

Acceso a datos por conexión directa **postgres.js** (rol `postgres`); autorización en la capa de app
(`lib/services/permissions.ts`).

## Ambientes (prod + dev)

Usando las ramas existentes **`main`** y **`develop`**, ambos en el mismo VPS vía Dokploy:

| Ambiente | Rama | Subdominio | BD |
|---|---|---|---|
| prod | `main` | `app.tudominio.com` | Postgres prod |
| dev | `develop` | `dev.tudominio.com` | Postgres **dev separada** |

- BD y secretos **separados** por ambiente; datos solo **prod→dev anonimizado**, nunca dev→prod.
- `dev` no público (basic auth / `noindex`).

## Setup del VPS (OVH)

1. Crear **OVH VPS-1** (Ubuntu 24.04), región **Canadá (Beauharnois)** (mejor latencia LatAm) o Francia.
2. Acceso por **llave SSH** (no password).
3. `apt update && apt upgrade -y`.
4. **Swap** (picos de build): `fallocate -l 3G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile` + persistir en `/etc/fstab`.
5. **Firewall** (`ufw`): permitir solo `OpenSSH`, `80`, `443` (y `3000` temporal para el setup de Dokploy). **Postgres nunca expuesto.**
6. Instalar **Dokploy**: `curl -sSL https://dokploy.com/install.sh | sh`. Acceder en `http://IP:3000`, crear admin, luego cerrar `3000`.

## Base de datos

- Postgres como servicio en Dokploy (contenedor + volumen), en **red interna**.
- Migraciones con `npm run migrate` (`node-pg-migrate`, `migrations/*.sql`).
- **Nota:** en `main` la BD es Supabase (prod interina); la migración destructiva que desacopla de Supabase
  (`auth.uid()` RLS + FK a `users`) vive en la rama `selfhost-ovh`.

## Deploy (CI/CD)

- Dokploy conectado a GitHub con **auto-deploy por rama** (webhook): `main`→prod, `develop`→dev.
- Build en el VPS (por eso el swap). `next build` + `npm run migrate` en el arranque.

## Dominio + HTTPS

- Registros **A** al IP del VPS (`app` y `dev`).
- SSL automático (Let's Encrypt vía Traefik/Dokploy).

## Backups y recuperación

- **Doble red:** backups diarios de OVH (incluidos en el VPS-1) **+** cron `pg_dump` propio.
- Script `/root/backup-db.sh`: `docker exec <pg> pg_dump -U <user> <db> | gzip > /root/backups/db-$(fecha).sql.gz`, rotación 14 días.
- Copia off-site gratis: `scp` de los dumps a la máquina local.
- Restaurar: `gunzip -c dump.sql.gz | docker exec -i <pg> psql -U <user> <db>`.

## Conexión a la BD desde local (editor SQL)

Vía **túnel SSH** (Postgres no expuesto): en DBeaver/TablePlus/DataGrip, activar SSH Tunnel (host=IP, user=root,
llave SSH) + DB (host=`localhost`, port=`5432`, credenciales de Postgres). **No abrir 5432 a internet.**

## Variables de entorno (destino)

```text
POSTGRES_URL=            # Postgres del VPS (red interna)
SESSION_SECRET=          # cadena aleatoria larga (openssl rand -hex 32)
APP_ORIGIN=              # https://tudominio.com (validación de Origin en mutaciones)
NEXT_PUBLIC_APP_URL=
```
(Las `SUPABASE_*` desaparecen al completar el cutover.)

## Seguridad

- Acceso por llave SSH; `ufw` (solo 22/80/443); Postgres nunca expuesto; panel Dokploy tras auth y no público.
- Cookies de sesión `httpOnly`/`Secure`/`SameSite`; hashing **bcrypt**; **rate-limit** en login; CSRF por `origin-check.ts`.
- Sin registro público (usuarios creados por admin).

## Cutover (resumen)

Bajar TTL de DNS → pausa breve de escrituras → `pg_dump` final de Supabase → restore al VPS → **copiar hashes
bcrypt** (`auth.users.encrypted_password`→`users.password_hash`, sin resetear claves) → dominio→VPS → verificar →
Supabase de respaldo unos días → desmantelar. **Downtime: minutos.**
