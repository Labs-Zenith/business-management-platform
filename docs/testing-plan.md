# Testing Plan

## Objetivo

Definir los casos minimos para validar que el MVP es usable, seguro y consistente antes de entregarlo a un cliente beta.

## Pruebas funcionales

### Autenticacion

- Usuario beta puede iniciar sesion.
- Usuario no autenticado no puede acceder al dashboard.
- Usuario sin perfil asociado no puede operar la app.

### Clientes

- Crear cliente con nombre obligatorio.
- Editar cliente.
- Listar clientes.
- Buscar cliente.
- Ver cliente sin deuda inicial.

### Facturas

- Crear factura con un item.
- Crear factura con varios items.
- Rechazar factura sin items.
- Rechazar item con cantidad cero.
- Rechazar item con precio negativo.
- Calcular total correctamente.
- Generar numero por negocio.
- Rechazar payload que intente enviar `business_id`, `number`, `status`, `subtotal`, `total` o `line_total`.
- Crear dos facturas concurrentes del mismo negocio sin duplicar numero.

### Pagos

- Registrar pago parcial.
- Actualizar saldo despues de pago parcial.
- Registrar pago restante.
- Actualizar estado a `paid`.
- Rechazar pago mayor al saldo.
- Rechazar pago sobre factura pagada.
- Rechazar payload que intente enviar `business_id`, `customer_id`, saldo o estado.
- Rechazar dos pagos concurrentes que en conjunto superen el saldo.

### Estados

- Factura nueva sin pagos queda `pending`.
- Factura con pago parcial queda `partially_paid`.
- Factura con saldo cero queda `paid`.
- Factura vencida con saldo queda `overdue`.
- Estado devuelto se calcula desde saldo y vencimiento aunque exista un estado persistido desactualizado.

### Dashboard

- Mostrar total pendiente correcto.
- Mostrar pagos del mes correctos.
- Mostrar numero de facturas vencidas.
- Mostrar pagos recientes.
- Mostrar clientes con mayor saldo.

### Comprobantes

- Abrir vista imprimible de factura.
- Abrir vista imprimible de recibo.
- Confirmar aviso de documento interno no DIAN.

## Pruebas de seguridad

- Usuario A no puede listar clientes de usuario B.
- Usuario A no puede abrir factura de usuario B por URL directa.
- Usuario A no puede registrar pago en factura de usuario B.
- Usuario A no puede leer ni actualizar datos del negocio de usuario B.
- API rechaza requests sin sesion.
- API ignora o rechaza cualquier `business_id` enviado por cliente.
- RLS bloquea consultas cruzadas aun si falla el filtro de API.
- Mutaciones rechazan `Origin` o `Referer` externo.
- Mutaciones rechazan `Content-Type` distinto de `application/json`.
- CORS no permite origenes externos en el MVP.
- Endpoints privados responden `Cache-Control: no-store`.
- Endpoints de usuario no usan `SUPABASE_SERVICE_ROLE_KEY`.
- UI no importa modulos server-only ni variables privadas.
- No se guardan tokens o secretos en `localStorage` o `sessionStorage`.

## Pruebas de API

- Swagger carga en `/api/docs`.
- OpenAPI carga en `/api/openapi.json`.
- En produccion beta, Swagger y OpenAPI requieren sesion.
- Swagger y OpenAPI no exponen secretos ni valores reales de variables de entorno.
- Endpoints documentados coinciden con implementacion.
- Requests invalidos devuelven `VALIDATION_ERROR`.
- Recursos inexistentes devuelven `NOT_FOUND`.
- Requests no autenticados devuelven `UNAUTHENTICATED`.
- Listados respetan paginacion y limite maximo.
- Query params invalidos se rechazan con `VALIDATION_ERROR`.

## Pruebas responsive

Validar en:

- Celular pequeno.
- Celular grande.
- Tablet.
- Escritorio.

Escenarios:

- Login.
- Dashboard.
- Lista de clientes.
- Crear factura con varios items.
- Registrar pago.
- Detalle de cliente.
- Comprobante imprimible.

## Pruebas de aceptacion con cliente beta

El cliente debe poder completar sin ayuda:

1. Iniciar sesion.
2. Crear un cliente.
3. Crear una factura interna.
4. Registrar un pago parcial.
5. Ver saldo pendiente.
6. Encontrar facturas vencidas.
7. Revisar historial del cliente.
8. Imprimir o guardar un comprobante.

## Criterio de salida

El MVP esta listo para beta privada cuando:

- Los flujos principales funcionan.
- Las reglas de saldos son correctas.
- Las operaciones concurrentes de pagos y numeracion son consistentes.
- La separacion por negocio esta probada.
- La frontera cliente-servidor esta probada.
- La app es usable en celular.
- Swagger permite revisar la API solo a usuarios autenticados en beta.
- No hay datos sensibles en el repositorio.
