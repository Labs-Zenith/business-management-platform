# UI/UX Flow

## Principios de diseno

- Mobile first.
- Interfaz clara y administrativa.
- Usar tema default de shadcn.
- No definir paleta personalizada en el MVP.
- Priorizar lectura rapida de saldos y estados.
- Evitar pantallas sobrecargadas.
- Mantener acciones principales visibles en celular.

## Navegacion principal

Secciones:

- Dashboard.
- Clientes.
- Facturas.
- Pagos.
- Negocio o ajustes basicos.

En movil:

- Navegacion inferior o menu compacto.
- Acciones principales con botones claros.
- Listados en tarjetas compactas.

En escritorio:

- Sidebar o navegacion lateral.
- Tablas con filtros basicos.
- Detalles en layouts de dos columnas cuando aplique.

## Flujo principal de validacion

1. Usuario inicia sesion.
2. Ve dashboard con saldos y actividad.
3. Crea un cliente.
4. Crea una factura interna para ese cliente.
5. Registra un pago parcial.
6. Ve saldo actualizado.
7. Entra al cliente y revisa historial.
8. Abre comprobante imprimible.

## Pantallas

### Login

Objetivo:

- Permitir acceso a usuarios beta.

Contenido:

- Email.
- Password.
- Boton ingresar.
- Mensaje simple de error.

No incluir registro publico.

### Dashboard

Objetivo:

- Dar claridad inmediata sobre cartera.

Contenido:

- Total pendiente por cobrar.
- Pagos del mes.
- Facturas vencidas.
- Pagos recientes.
- Clientes con mayor saldo.

Acciones:

- Crear cliente.
- Crear factura.

### Clientes

Objetivo:

- Gestionar clientes y ver deuda por cliente.

Contenido:

- Buscador.
- Lista de clientes.
- Nombre.
- Telefono.
- Saldo pendiente.
- Estado activo.

Acciones:

- Crear cliente.
- Ver detalle.
- Editar.

### Detalle de cliente

Objetivo:

- Entender la relacion financiera completa con un cliente.

Contenido:

- Datos del cliente.
- Total facturado.
- Total pagado.
- Saldo pendiente.
- Facturas.
- Pagos recientes.

Acciones:

- Crear factura para este cliente.
- Registrar pago desde una factura pendiente.

### Facturas

Objetivo:

- Consultar documentos internos y sus estados.

Contenido:

- Numero.
- Cliente.
- Fecha.
- Vencimiento.
- Total.
- Saldo.
- Estado.

Filtros:

- Estado.
- Cliente.
- Fecha.

### Crear factura

Objetivo:

- Registrar una cuenta por cobrar.

Campos:

- Cliente.
- Fecha de emision.
- Fecha de vencimiento.
- Items con descripcion, cantidad y valor unitario.
- Nota opcional.

Comportamiento:

- Calcular total en pantalla.
- Validar al menos un item.
- Guardar como factura interna.

### Detalle de factura

Objetivo:

- Ver valores, saldo y pagos de una factura.

Contenido:

- Datos de factura.
- Cliente.
- Items.
- Total.
- Pagos registrados.
- Saldo pendiente.
- Estado.

Acciones:

- Registrar pago.
- Imprimir comprobante.

### Registrar pago

Objetivo:

- Registrar un abono o pago total.

Campos:

- Fecha.
- Monto.
- Metodo.
- Nota opcional.

Comportamiento:

- Mostrar saldo actual.
- No permitir monto mayor al saldo.
- Actualizar estado calculado al guardar.

### Comprobante imprimible

Objetivo:

- Permitir entregar o guardar un soporte simple.

Contenido:

- Datos del negocio.
- Datos del cliente.
- Numero de factura o recibo.
- Items o pago.
- Valores.
- Fecha.
- Aviso DIAN.

## Estados visuales

- `pending`: pendiente.
- `partially_paid`: parcialmente pagada.
- `paid`: pagada.
- `overdue`: vencida.

Los estados deben usar badges de shadcn. La paleta se mantiene default hasta crear identidad visual propia.
