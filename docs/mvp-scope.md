# MVP Scope

## Objetivo del MVP

Validar con clientes reales si una app simple para controlar clientes, facturas internas, pagos y saldos pendientes resuelve un problema suficientemente fuerte como para pagar por ella.

El MVP debe ser una app usable, no solo una demo visual. Si un cliente aprueba la idea, se le debe poder crear una cuenta y darle acceso privado.

## En alcance

### Autenticacion y acceso

- Login privado.
- Cuentas creadas manualmente por el administrador.
- Un usuario asociado a un negocio.
- Sesion segura con Supabase Auth.

### Negocio

- Perfil basico del negocio.
- Nombre comercial.
- Telefono.
- Correo.
- Direccion opcional.
- Moneda inicial COP.

### Clientes

- Crear cliente.
- Listar clientes.
- Editar cliente.
- Ver detalle financiero del cliente.
- Consultar saldo pendiente por cliente.
- Ver historial de facturas y pagos.

### Facturas internas

- Crear factura interna.
- Asociar factura a un cliente.
- Agregar items manuales de producto o servicio.
- Definir fecha de emision.
- Definir fecha de vencimiento.
- Calcular total.
- Ver estado y saldo.

### Pagos

- Registrar pago sobre una factura.
- Permitir pagos parciales.
- Permitir pago total.
- Guardar metodo de pago.
- Guardar nota opcional.
- Actualizar saldo y estado calculado de factura.

### Dashboard

- Total pendiente por cobrar.
- Total pagado del mes.
- Facturas vencidas.
- Pagos recientes.
- Clientes con mayor saldo pendiente.

### Comprobantes

- Vista imprimible de factura interna.
- Vista imprimible de recibo de pago.
- Aviso visible: "Documento interno, no valido como factura electronica DIAN."

## Fuera de alcance

- Facturacion electronica DIAN.
- Integraciones con DIAN.
- Inventario y control de stock.
- Roles y permisos.
- Multiples usuarios por negocio.
- Registro publico/autoservicio.
- Suscripciones y pagos en linea.
- PDF avanzado generado en servidor.
- Envio por correo.
- Envio por WhatsApp.
- Recordatorios automaticos.
- Facturas recurrentes.
- Reportes contables avanzados.
- Integraciones contables.

## Reglas funcionales

- Una factura puede tener multiples pagos.
- Un pago pertenece a una sola factura.
- El saldo pendiente se calcula como total de factura menos suma de pagos.
- No se permiten pagos mayores al saldo pendiente en el MVP.
- Una factura sin pagos y con saldo queda `pending`.
- Una factura con pagos parciales queda `partially_paid`.
- Una factura con saldo cero queda `paid`.
- Una factura con fecha vencida y saldo pendiente queda `overdue`.
- El estado `overdue` tiene prioridad visual sobre `pending` cuando la fecha de vencimiento ya paso.
- El estado se calcula en servidor y no se acepta desde el cliente.

## Criterio de exito del MVP

El MVP se considera valido si un negocio puede usarlo durante una prueba real para:

- Registrar sus clientes.
- Crear sus facturas internas.
- Registrar pagos.
- Saber quien le debe.
- Saber cuanto le deben.
- Revisar historial por cliente.
- Entender sus saldos sin depender de Excel.
