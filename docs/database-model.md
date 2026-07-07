# Database Model

## Convenciones

- Base de datos: Postgres en Supabase.
- Todas las tablas usan `id uuid primary key`.
- Todas las tablas relevantes usan `created_at` y `updated_at`.
- Las tablas operativas usan `business_id`.
- RLS debe estar activo en tablas operativas.
- La moneda inicial es COP.

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

Estados permitidos:

- `pending`
- `partially_paid`
- `paid`
- `overdue`

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

## Vistas o funciones recomendadas

Para evitar duplicar calculos, se recomienda crear vistas o queries centralizadas para:

- Facturas con total pagado y saldo.
- Clientes con saldo acumulado.
- Dashboard de negocio.

Estas vistas deben respetar `business_id`.
