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
- El navegador solo debe llamar endpoints same-origin bajo `/api` para datos operativos.
- El cliente puede usar Supabase Auth con la anon key publica para login y sesion, pero no debe consultar tablas financieras directamente.
- Todos los endpoints privados deben responder con `Cache-Control: no-store`.
- Los endpoints de mutacion (`POST`, `PATCH` y futuros `PUT` o `DELETE`) deben aceptar solo `Content-Type: application/json`.
- Las mutaciones autenticadas por cookie deben validar `Origin` o `Referer` contra el origen configurado de la app.
- CORS permanece deshabilitado por defecto; no se permiten origenes externos en el MVP.
- Los schemas Zod deben ser estrictos para rechazar campos no permitidos.
- Los endpoints de listado deben usar paginacion con limite maximo.

## Campos controlados por servidor

El cliente nunca debe enviar ni modificar:

- `business_id`
- `status`
- `subtotal`
- `total`
- `line_total`
- `number`
- `customer_id` al registrar pagos
- `created_at`
- `updated_at`

Estos valores se derivan en el backend desde la sesion, la factura, los items, las reglas de negocio o la base de datos.

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

En produccion beta debe requerir sesion autenticada. No debe incluir secretos, llaves, tokens ni valores reales de variables de entorno.

### GET /api/docs

Renderiza Swagger UI para revisar y probar la coleccion.

En produccion beta debe requerir sesion autenticada y apuntar a `/api/openapi.json`.

## Customers

### GET /api/customers

Lista clientes del negocio autenticado.

Query opcional:

- `q`: busqueda por nombre, documento, email o telefono.
- `status`: `active` o `inactive`.
- `page`: numero de pagina, minimo 1.
- `pageSize`: cantidad por pagina, maximo 50.

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

Reglas:

- Requiere sesion, perfil y negocio asociado.
- Rechaza cualquier `business_id` enviado por el cliente.
- Valida longitud maxima de textos y formato de email si se envia.
- El cliente queda activo por defecto.

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

No permite cambiar `business_id`, saldos ni campos de auditoria.

Reglas:

- El cliente debe pertenecer al negocio autenticado.
- Solo permite editar datos descriptivos e `isActive`.
- Rechaza payloads vacios o campos desconocidos sensibles.

## Invoices

### GET /api/invoices

Lista facturas del negocio autenticado.

Query opcional:

- `customerId`
- `status`
- `from`
- `to`
- `page`: numero de pagina, minimo 1.
- `pageSize`: cantidad por pagina, maximo 50.

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
- El backend calcula `line_total`, `subtotal`, `total` y estado.
- El cliente no puede enviar `number`, `status`, `subtotal`, `total`, `line_total` ni `business_id`.
- La creacion de factura y sus items debe ejecutarse de forma atomica.
- La generacion de numero debe ser atomica por negocio para evitar duplicados concurrentes.

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
- El backend deriva `customer_id` desde la factura.
- El cliente no puede enviar `business_id`, `customer_id`, saldo ni estado.
- El registro de pago y la validacion de saldo deben ejecutarse en una transaccion o RPC con bloqueo de la factura.
- Despues de registrar el pago, el estado calculado debe reflejar el nuevo saldo.

## Payments

### GET /api/payments

Lista pagos del negocio autenticado.

Query opcional:

- `customerId`
- `invoiceId`
- `from`
- `to`
- `page`: numero de pagina, minimo 1.
- `pageSize`: cantidad por pagina, maximo 50.

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
- Metodo HTTP permitido.
- Content type JSON en mutaciones.
- Origin o Referer valido en mutaciones con cookie.
- Parametros de ruta y query validados como datos no confiables.

La API no debe exponer ids ni registros de otros negocios.

## Peticiones desde cliente y servidor

Permitido desde el cliente:

- Login, logout y lectura de sesion con Supabase Auth usando anon key publica.
- Requests same-origin a `/api/*`.
- Validaciones de formulario para mejorar UX.

Debe hacerse del lado del servidor:

- Consultas a tablas operativas de Supabase.
- Calculo de saldos, totales, estados y numeros de factura.
- Validacion de ownership y `business_id`.
- Uso de llaves privadas o `SUPABASE_SERVICE_ROLE_KEY`.
- Registro de pagos y cualquier operacion que cambie saldos.
