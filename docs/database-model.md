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

## Relaciones

- Un negocio tiene muchos perfiles.
- Un negocio tiene muchos clientes.
- Un cliente tiene muchas facturas.
- Una factura tiene muchos items.
- Una factura tiene muchos pagos.
- Un pago pertenece a una factura y a un cliente.

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
