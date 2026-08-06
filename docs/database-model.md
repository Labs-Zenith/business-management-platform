# Database Model

## Convenciones

- Base de datos: Postgres en Supabase.
- Todas las tablas usan `id uuid primary key`.
- Todas las tablas relevantes usan `created_at` y `updated_at`.
- Las tablas operativas usan `business_id`.
- RLS debe estar activo en tablas operativas y en `businesses`.
- La moneda inicial es COP.
- Los totales, saldos y estados se consideran valores autoritativos del servidor.

## Entidades

### businesses

Representa el espacio de trabajo de cada negocio.

Campos:

- `id uuid primary key`
- `name text not null`
- `email text`
- `phone text`
- `address text`
- `currency text not null default 'COP'`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

### profiles

Relaciona usuarios autenticados con negocios.

Campos:

- `id uuid primary key`
- `user_id uuid not null unique`
- `business_id uuid not null references businesses(id)`
- `full_name text`
- `email text not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Regla:

- En el MVP, un usuario pertenece a un solo negocio.

### customers

Clientes del negocio.

Campos:

- `id uuid primary key`
- `business_id uuid not null references businesses(id)`
- `name text not null`
- `document_number text`
- `email text`
- `phone text`
- `address text`
- `notes text`
- `is_active boolean not null default true`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

### invoices

Facturas internas de control administrativo.

Campos:

- `id uuid primary key`
- `business_id uuid not null references businesses(id)`
- `customer_id uuid not null references customers(id)`
- `number text not null`
- `issue_date date not null`
- `due_date date`
- `subtotal numeric(12,2) not null`
- `total numeric(12,2) not null`
- `status text not null`
- `notes text`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Restricciones:

- `total >= 0`
- `subtotal >= 0`
- `number` debe ser unico por `business_id`.
- `business_id, customer_id` debe corresponder a un cliente del mismo negocio.

Estados permitidos:

- `pending`
- `partially_paid`
- `paid`
- `overdue`

Regla:

- `status` no se acepta desde el cliente.
- En el MVP puede persistirse para facilitar consultas, pero siempre debe recalcularse en servidor al crear facturas, registrar pagos o consultar vistas financieras.
- Si hay diferencia entre `status` persistido y el estado calculado, la respuesta debe usar el estado calculado.

### invoice_items

Items manuales de productos o servicios dentro de una factura.

Campos:

- `id uuid primary key`
- `business_id uuid not null references businesses(id)`
- `invoice_id uuid not null references invoices(id)`
- `description text not null`
- `quantity numeric(12,2) not null`
- `unit_price numeric(12,2) not null`
- `line_total numeric(12,2) not null`
- `created_at timestamptz not null`

Restricciones:

- `quantity > 0`
- `unit_price >= 0`
- `line_total >= 0`
- `line_total = quantity * unit_price`, calculado por servidor.
- `business_id, invoice_id` debe corresponder a una factura del mismo negocio.

### payments

Pagos registrados sobre facturas.

Campos:

- `id uuid primary key`
- `business_id uuid not null references businesses(id)`
- `invoice_id uuid not null references invoices(id)`
- `customer_id uuid not null references customers(id)`
- `payment_date date not null`
- `amount numeric(12,2) not null`
- `method text`
- `notes text`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Restricciones:

- `amount > 0`
- `customer_id` se deriva desde la factura y no se acepta desde el cliente.
- `business_id, invoice_id, customer_id` debe ser consistente con una factura del mismo negocio.
- No se permite insertar pagos que superen el saldo pendiente.

### catalog_products

Catálogo comercial: la lista de precios de lo que el negocio **vende**. No confundir
con dos vecinos cercanos:

- `products` es **inventario** — un SKU con stock y movimientos. Un producto de
  catálogo no tiene stock; es un listado vendible con una regla de precio.
- `invoice_types`, `expense_categories`, etc. son catálogos de **referencia**
  globales, compartidos entre negocios y sin relación con precios.

Campos:

- `id uuid primary key default gen_random_uuid()`
- `business_id uuid not null references businesses(id)`
- `name text not null`
- `category text` — agrupación libre para mostrar ("Avisos", "Stickers"). Sin FK.
- `description text`
- `pricing_mode text not null` — uno de `fixed`, `variant`, `package`, `tiered`, `area`
- `min_order_quantity integer not null default 1`
- `fixed_unit_price integer` — solo modo `fixed`
- `area_base_price integer` — solo modo `area`
- `area_rate_per_m2 integer` — solo modo `area`, centavos por **metro cuadrado**
- `area_min_price integer` — solo modo `area`, opcional
- `active boolean not null default true`
- `created_at`, `updated_at timestamptz not null`

Los cinco modos de precio, y qué recoge cada uno:

| Modo | Precio | Cantidad |
| --- | --- | --- |
| `fixed` | un precio unitario en la propia fila | libre, ≥ `min_order_quantity` |
| `variant` | cada variante trae su `unit_price` | libre, ≥ `min_order_quantity` |
| `package` | cada variante es un paquete cerrado | se eligen paquetes, nunca unidades sueltas |
| `tiered` | escalones en `catalog_price_tiers` | la fijas el escalón elegido |
| `area` | `base + tarifa_m² × (ancho×alto/10.000)` | libre, ≥ `min_order_quantity` |

Restricciones:

- `min_order_quantity > 0`.
- `unique (business_id, name)` — llave natural para el upsert idempotente del seed.
- `catalog_products_mode_fields_chk` fija exactamente qué columnas pueden ser no nulas
  por modo: `fixed_unit_price` solo en `fixed`; `area_base_price`/`area_rate_per_m2`
  solo en `area`; ninguna de ellas en `variant`/`package`/`tiered`, que llevan su
  precio íntegro en las tablas hijas.

**El mínimo de pedido es una regla de cantidad, no de precio.** No se puede comprar un
sticker suelto de un paquete de 750. Los modos `package` y `tiered` lo garantizan por
construcción (no existe fracción de paquete ni escalón por debajo del más bajo), así
que su mínimo es derivado y no se almacena. Solo los modos de cantidad libre usan
`min_order_quantity`.

**Por qué la tarifa se guarda por m² y no por cm²:** el dinero son enteros de centavos
COP de punta a punta. Una tarifa realista por cm² es subcentavo (~$80.000 COP/m² son
0,8 centavos/cm²), lo que obligaría a un `numeric` fraccionario o perdería precisión en
silencio. Por m² sigue siendo un entero exacto y la división ocurre en un único sitio
documentado, dentro del motor de precios del catálogo.

### catalog_product_variants

Sub-listados con nombre bajo un producto: la medida o material que el cliente elige.

Campos:

- `id uuid primary key default gen_random_uuid()`
- `product_id uuid not null references catalog_products(id) on delete cascade`
- `name text not null` — la medida/material ("150 x 55 cm", "3x3 cm")
- `description text`
- `sort_order integer not null default 0`
- `unit_price integer` — modo `variant`
- `package_quantity integer` — modo `package`: unidades dentro de UN paquete
- `package_total_price integer` — modo `package`: precio de UN paquete
- `active boolean not null default true`
- `created_at`, `updated_at timestamptz not null`

Restricciones:

- `catalog_product_variants_fields_chk`: exactamente una de las tres formas está
  poblada — `unit_price` sola, el par `package_*`, o ninguna (variante de escalera).
- `package_quantity > 0` cuando no es nulo.

Así conviven el paquete y la escalera en un mismo esquema sin nulos ambiguos: una
variante es **o** paquete **o** portadora de escalones, nunca ambas.

### catalog_price_tiers

La escalera de cantidades de una variante en modo `tiered`.

Campos:

- `id uuid primary key default gen_random_uuid()`
- `variant_id uuid not null references catalog_product_variants(id) on delete cascade`
- `quantity integer not null` — la cantidad **exacta** que se vende, no un mínimo de rango
- `unit_price integer` — escalón por unidad: total = `unit_price × quantity`
- `flat_total_price integer` — escalón de suma alzada, sin precio unitario implícito
- `sort_order integer not null default 0`

Restricciones:

- `quantity > 0`.
- `catalog_price_tiers_price_mode_chk`: exactamente uno de `unit_price` /
  `flat_total_price`.
- Índice único `(variant_id, quantity)` — dos escalones a la misma cantidad harían
  ambigua la selección.

El pedido mínimo de la variante es `min(quantity)` de sus escalones, **derivado en
lectura**, nunca duplicado en una columna que pudiera desviarse de la escalera que
describe.

Editar un precio de catálogo (producto, variante o escalón) no reescribe ningún precio
ya capturado en otro lugar: cualquier línea de documento que referencie un producto de
catálogo guarda su propio precio como una instantánea al momento de crearse.

## Relaciones

- Un negocio tiene muchos perfiles.
- Un negocio tiene muchos clientes.
- Un cliente tiene muchas facturas.
- Una factura tiene muchos items.
- Una factura tiene muchos pagos.
- Un pago pertenece a una factura y a un cliente.
- Un negocio tiene muchos productos de catálogo.
- Un producto de catálogo tiene muchas variantes; una variante tiene muchos escalones de precio.

## Calculos derivados

### Total de factura

`invoice.total = sum(invoice_items.line_total)`

En el MVP no se manejan impuestos ni descuentos globales.

`subtotal` y `total` son iguales en el MVP y se calculan en servidor.

### Total pagado

`paid_amount = sum(payments.amount where payments.invoice_id = invoice.id)`

### Saldo pendiente

`balance = invoice.total - paid_amount`

### Estado de factura

Reglas:

1. Si `balance = 0`, estado `paid`.
2. Si `balance > 0` y existe al menos un pago, estado `partially_paid`.
3. Si `balance > 0`, no hay pagos y `due_date` es futura o nula, estado `pending`.
4. Si `balance > 0` y `due_date` ya paso, estado `overdue`.

La interfaz puede mostrar vencida como prioridad visual aunque internamente se recalcule al consultar.

## Integridad transaccional

### Crear factura

La creacion de factura debe ejecutarse en una transaccion o RPC:

1. Resolver `business_id` desde la sesion.
2. Validar que el cliente pertenece al negocio.
3. Generar `number` de forma atomica por negocio.
4. Calcular `line_total`, `subtotal`, `total` y estado inicial.
5. Insertar factura e items.

### Registrar pago

El registro de pago debe ejecutarse en una transaccion o RPC:

1. Resolver `business_id` desde la sesion.
2. Bloquear o consultar de forma consistente la factura objetivo.
3. Validar que la factura pertenece al negocio.
4. Recalcular total pagado y saldo pendiente.
5. Rechazar pagos mayores al saldo o sobre facturas ya pagadas.
6. Derivar `customer_id` desde la factura.
7. Insertar pago.
8. Recalcular estado de factura.

Esto evita sobrepagos cuando dos requests llegan al mismo tiempo.

## Indices y restricciones recomendadas

- `unique (business_id, number)` en `invoices`.
- Indices por `business_id` en tablas operativas.
- Indices compuestos para filtros frecuentes: `customers (business_id, is_active)`, `invoices (business_id, customer_id)`, `invoices (business_id, status)`, `payments (business_id, invoice_id)`.
- Foreign keys compuestas o validaciones server-side/RPC para asegurar que recursos relacionados pertenecen al mismo negocio.

## Vistas o funciones recomendadas

Para evitar duplicar calculos, se recomienda crear vistas o queries centralizadas para:

- Facturas con total pagado y saldo.
- Clientes con saldo acumulado.
- Dashboard de negocio.

Estas vistas deben respetar `business_id`.

Las vistas deben devolver estado calculado, total pagado y saldo pendiente, y deben ser la fuente preferida para dashboard, listados financieros y detalle de cliente.
