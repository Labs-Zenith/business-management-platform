# Onboarding de clientes (provisión + carga de inventario)

Runbook reproducible para dar de alta un cliente: crear su **usuario + negocio** y
**cargar su inventario** desde un `.xlsx`. No contiene secretos ni datos del
cliente (las contraseñas se generan al correr y se entregan al operador; los
`.xlsx` viven en `docs/inventario/`, que está en `.gitignore`).

## Requisitos
- `.env.local` con las credenciales de Supabase (`NEXT_PUBLIC_SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `POSTGRES_URL`, …).
- Ejecutar desde la raíz del repo.

## 1. Provisionar usuario + negocio
```bash
# Genera una clave segura (guárdala en tu gestor; NO se commitea):
PW=$(node -e "console.log(require('crypto').randomBytes(9).toString('base64').replace(/[+/=]/g,'').slice(0,12))")
echo "clave: $PW"

node --env-file=.env.local scripts/create-user.mjs \
  --username <usuario> --password "$PW" --role admin \
  --name "<Nombre del negocio>" --business-name "<Nombre del negocio>"
# Anota el business_id que imprime ("Created business ... (<uuid>)").
```
> Nota: si falla con `invalid JWT ... ES256 kid <nil>` (hipo transitorio de firma
> de Supabase), simplemente reintenta el mismo comando.

## 2. Cargar el inventario (xlsx → productos + stock inicial)
```bash
npx tsx --env-file=.env.local scripts/clientes/import-inventory.ts \
  --business-id <uuid-del-paso-1> \
  --file "docs/inventario/<archivo>.xlsx" [--dry-run]
```
- Detecta la cabecera por nombre de columna (`Producto`, `Cantidad`, y opcional
  `Categoria`/`Color / Variante`/`Talla`/`Observaciones`), salta el banner de
  título, la hoja `Resumen` y las filas `TOTAL/subtotal/resumen`.
- Crea un producto por fila (para variantes: `Producto · Talla X · Color`) con
  `unitCost 0`, y un movimiento de entrada por la `Cantidad`.
- Idempotente por nombre: re-correr no duplica.

## Clientes cargados

| Cliente / negocio | usuario | business_id | archivo | resultado |
|---|---|---|---|---|
| LCH centro médico estético | `lch` | `a39179ca-d653-4602-9a8d-80dc6e0167df` | `Inventario_LCH (1).xlsx` | 19 productos · 75 uds |
| Kahalaa bq | `kahalaa` | `3c96af29-1351-4fe6-97f9-ce8782a8ca9e` | `Inventario_Kahalaa_BQ (1).xlsx` | 110 productos · 211 uds |

Comandos exactos usados:
```bash
npx tsx --env-file=.env.local scripts/clientes/import-inventory.ts \
  --business-id a39179ca-d653-4602-9a8d-80dc6e0167df \
  --file "docs/inventario/Inventario_LCH (1).xlsx"

npx tsx --env-file=.env.local scripts/clientes/import-inventory.ts \
  --business-id 3c96af29-1351-4fe6-97f9-ce8782a8ca9e \
  --file "docs/inventario/Inventario_Kahalaa_BQ (1).xlsx"
```

Verificación (stock por negocio):
```sql
SELECT b.name, count(DISTINCT pr.id) AS productos,
  COALESCE(SUM(CASE WHEN m.type='in' THEN m.quantity ELSE -m.quantity END),0) AS stock
FROM businesses b JOIN products pr ON pr.business_id=b.id
LEFT JOIN inventory_movements m ON m.product_id=pr.id
WHERE b.id = '<uuid>' GROUP BY b.name;
```
