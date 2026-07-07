# API Spec

## Objetivo

Definir la API inicial para el MVP y documentarla con OpenAPI/Swagger.

La API se implementara con Next.js Route Handlers bajo `/api`.

## Convenciones

- Todas las respuestas usan JSON.
- Todos los endpoints privados requieren usuario autenticado.
- El backend resuelve `business_id` desde la sesion.
- El cliente nunca envia `business_id`.
- Las entradas se validan con Zod.
- Los errores deben tener estructura consistente.

## Error format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request payload",
    "details": {}
  }
}
```

Codigos comunes:

- `UNAUTHENTICATED`
- `FORBIDDEN`
- `NOT_FOUND`
- `VALIDATION_ERROR`
- `CONFLICT`
- `INTERNAL_ERROR`

## Endpoints de documentacion

### GET /api/openapi.json

Devuelve la especificacion OpenAPI.

### GET /api/docs

Renderiza Swagger UI para revisar y probar la coleccion.

## Customers

### GET /api/customers

Lista clientes del negocio autenticado.

Query opcional:

- `q`: busqueda por nombre, documento, email o telefono.
- `status`: `active` o `inactive`.

Respuesta:

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Cliente Demo",
      "documentNumber": "123",
      "email": "cliente@example.com",
      "phone": "3000000000",
      "isActive": true,
      "balance": 300000
    }
  ]
}
```

### POST /api/customers

Crea un cliente.

Request:

```json
{
  "name": "Cliente Demo",
  "documentNumber": "123",
  "email": "cliente@example.com",
  "phone": "3000000000",
  "address": "Direccion",
  "notes": "Nota interna"
}
```

### GET /api/customers/{id}

Obtiene detalle de cliente con resumen financiero.

Debe incluir:

- Datos del cliente.
- Total facturado.
- Total pagado.
- Saldo pendiente.
- Facturas recientes.
- Pagos recientes.

### PATCH /api/customers/{id}

Actualiza datos editables del cliente.

No permite cambiar `business_id`.

## Invoices

### GET /api/invoices

Lista facturas del negocio autenticado.

Query opcional:

- `customerId`
- `status`
- `from`
- `to`

Respuesta incluye:

- Factura.
- Cliente.
- Total.
- Total pagado.
- Saldo.
- Estado.

### POST /api/invoices

Crea factura interna.

Request:

```json
{
  "customerId": "uuid",
  "issueDate": "2026-07-06",
  "dueDate": "2026-07-20",
  "items": [
    {
      "description": "Servicio de estetica",
      "quantity": 1,
      "unitPrice": 500000
    }
  ],
  "notes": "Documento interno"
}
```

Reglas:

- Debe existir el cliente en el mismo negocio.
- Debe haber al menos un item.
- Cantidad debe ser mayor a cero.
- Precio unitario no puede ser negativo.
- El numero de factura se genera por negocio.

### GET /api/invoices/{id}

Obtiene detalle de factura.

Debe incluir:

- Datos de factura.
- Cliente.
- Items.
- Pagos.
- Total pagado.
- Saldo.
- Estado calculado.

### POST /api/invoices/{id}/payments

Registra pago sobre una factura.

Request:

```json
{
  "paymentDate": "2026-07-06",
  "amount": 200000,
  "method": "cash",
  "notes": "Pago parcial"
}
```

Reglas:

- La factura debe pertenecer al negocio.
- El monto debe ser mayor a cero.
- El monto no puede exceder el saldo pendiente.
- Despues de registrar el pago, se actualiza el estado de la factura.

## Payments

### GET /api/payments

Lista pagos del negocio autenticado.

Query opcional:

- `customerId`
- `invoiceId`
- `from`
- `to`

Respuesta incluye:

- Pago.
- Cliente.
- Factura.
- Metodo.
- Fecha.

## Dashboard

### GET /api/dashboard/summary

Devuelve resumen del negocio autenticado.

Respuesta:

```json
{
  "data": {
    "pendingBalance": 1200000,
    "paidThisMonth": 800000,
    "overdueInvoices": 4,
    "recentPayments": [],
    "topDebtors": []
  }
}
```

## Seguridad de API

Cada endpoint debe validar:

- Usuario autenticado.
- Perfil existente.
- Negocio asociado.
- Ownership del recurso.
- Payload valido.

La API no debe exponer ids ni registros de otros negocios.
