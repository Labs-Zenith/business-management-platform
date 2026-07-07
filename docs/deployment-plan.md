# Deployment Plan

## Objetivo

Definir como desplegar el MVP como beta privada usando Vercel y Supabase, con bajo costo operativo y capacidad de crecimiento.

## Servicios

- Hosting de app: Vercel.
- Base de datos: Supabase Postgres.
- Auth: Supabase Auth.
- Documentacion API: Swagger servido desde la app.

## Ambientes

### Desarrollo

- Next.js local.
- Supabase project de desarrollo o Supabase local si se decide despues.
- Variables en `.env.local`.

### Produccion beta

- Vercel project conectado al repositorio.
- Supabase project de produccion.
- Variables configuradas en Vercel.
- Acceso solo para usuarios creados manualmente.

## Variables de entorno esperadas

Nombres sugeridos:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
APP_ORIGIN=
```

Reglas:

- Toda variable `NEXT_PUBLIC_*` se considera publica y visible en el navegador.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` puede estar en cliente porque es publica por diseno, pero debe depender de RLS para proteger datos.
- `SUPABASE_SERVICE_ROLE_KEY` solo debe usarse en scripts administrativos o procesos server-side aislados.
- `SUPABASE_SERVICE_ROLE_KEY` no debe usarse en Route Handlers de usuario.
- `APP_ORIGIN` o `NEXT_PUBLIC_APP_URL` debe usarse para validar `Origin` o `Referer` en mutaciones.
- No versionar valores reales.
- Mantener `.env.example` cuando se implemente codigo.

## Configuracion inicial de Supabase

Pasos:

1. Crear proyecto Supabase.
2. Crear tablas y relaciones.
3. Activar RLS en `businesses`, `profiles`, `customers`, `invoices`, `invoice_items` y `payments`.
4. Crear politicas por `business_id`.
5. Configurar Auth con email/password.
6. Crear primer negocio.
7. Crear primer usuario beta.
8. Asociar usuario en `profiles`.
9. Probar aislamiento con dos negocios distintos antes de usar datos reales.

## Configuracion inicial de Vercel

Pasos:

1. Crear proyecto Vercel.
2. Conectar repositorio.
3. Configurar variables de entorno.
4. Deploy de preview.
5. Configurar headers de seguridad o confirmar que se aplican en la capa edge.
6. Validar login, dashboard y API docs.
7. Confirmar que `/api/docs` y `/api/openapi.json` requieren sesion en produccion beta.
8. Confirmar que endpoints privados responden `Cache-Control: no-store`.
9. Confirmar que mutaciones rechazan origenes no permitidos.
10. Promover a produccion beta.

## Flujo de entrega a cliente beta

1. El administrador crea negocio.
2. El administrador crea usuario.
3. Se asocia usuario al negocio.
4. Se entrega URL de la app.
5. El cliente inicia sesion.
6. El cliente prueba con datos reales o controlados.
7. Se recoge feedback.

## Backups y recuperacion

Para beta:

- Usar backups disponibles del plan de Supabase.
- Exportar datos manualmente si el cliente empieza a depender del sistema.

Antes de cobrar formalmente:

- Definir politica de backups.
- Definir restauracion.
- Definir retencion de datos.
- Definir monitoreo de errores.

## Observabilidad inicial

Minimo recomendado:

- Logs de Vercel.
- Logs de Supabase.
- Manejo consistente de errores.
- Registro de errores en UI sin mostrar detalles sensibles.
- Redaccion de cookies, tokens, cabeceras `Authorization` y variables de entorno en logs.
- Alertar manualmente cualquier error repetido en pagos, saldos o autorizacion durante beta.

Futuro:

- Error tracking.
- Metricas de uso.
- Auditoria por usuario.

## Consideracion VPS vs serverless

Para el MVP se elige Vercel + Supabase porque reduce tiempo de operacion y permite validar rapido.

Una VPS dockerizada puede ser mas barata en dinero mensual, pero exige:

- Configurar servidor.
- Mantener SSL.
- Actualizar sistema.
- Administrar backups.
- Monitorear caidas.
- Asegurar Postgres.

La arquitectura con Postgres y Next.js debe mantenerse portable para poder migrar en el futuro si el costo operativo lo justifica.
