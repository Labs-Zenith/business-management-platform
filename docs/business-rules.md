# Reglas de Negocio

Este documento es la **fuente única de verdad** sobre cómo se comporta la lógica de negocio de la plataforma. Consolida todas las reglas vigentes: las del MVP original (facturas, pagos, clientes, dashboard, comprobantes) y todo lo incorporado en la Fase 2 (roles y multi-negocio, gastos, nómina, inventario, auditoría, exportación del dashboard).

Está escrito para que una persona no técnica (o un ingeniero nuevo) entienda exactamente qué hace el sistema sin leer el código. Cada regla se enuncia como una afirmación clara y verificable.

Las convenciones técnicas transversales (dinero en centavos enteros, fechas en zona horaria local, numeración de facturas, concurrencia) están al final, en el **Apéndice Técnico**, porque sustentan la corrección de todos los dominios.

> **Nota sobre alcance del "negocio":** Todo dato (cliente, factura, pago, gasto, empleado, producto, movimiento, registro de auditoría) pertenece a exactamente **un negocio** (`business_id`). El `business_id` **siempre** se resuelve en el servidor a partir de la sesión y **nunca** se acepta desde el cliente (ni en el cuerpo, ni en query params, ni en headers). Esta regla de aislamiento entre negocios aplica de forma absoluta a cada lectura y cada escritura del sistema y no se repite en cada dominio.

---

## 1. Autenticación y Sesión

- **1.1** El acceso a la aplicación es privado: no existe registro público ni autoservicio. Las cuentas las crea manualmente el administrador.
- **1.2** Toda página protegida y todo endpoint privado `/api/*` requieren una sesión válida antes de ejecutar cualquier lógica de negocio.
- **1.3** Una página sin sesión válida redirige a la pantalla de login. Un endpoint API sin sesión válida responde `401` con `error.code = "UNAUTHENTICATED"`.
- **1.4** Una sesión (`Session`) contiene exactamente: `userId`, `businessId`, `email` y `role`. Todo el código de UI y de servicios depende del puerto `AuthPort`, nunca del adaptador de autenticación directamente.
- **1.5** Una cookie de sesión que no incluya `role` se considera **inválida**: `getSession()` devuelve `null` y el usuario es forzado a volver a iniciar sesión.
- **1.6** La cookie de sesión es opaca y `HttpOnly`, con `SameSite=Lax` como mínimo, y `Secure` cuando se sirve sobre HTTPS. El logout la borra; las peticiones posteriores se tratan como no autenticadas.
- **1.7** Credenciales incorrectas muestran un mensaje de error genérico y no establecen ninguna cookie de sesión.

## 2. Roles y Permisos (Modelo Multi-Negocio)

- **2.1** La pertenencia de un usuario a un negocio se modela en una tabla de membresías (`profiles`) con clave única `(user_id, business_id)`. Cada fila lleva exactamente **un** rol para ese usuario en ese negocio.
- **2.2** Los roles válidos son exactamente dos: `admin` y `worker`.
- **2.3** Un mismo usuario puede tener membresías en **varios** negocios, con roles independientes en cada uno (por ejemplo `admin` en el negocio A y `worker` en el negocio B). Un rol nunca "se hereda" de un negocio a otro.
- **2.4** No pueden existir dos membresías para el mismo par `(user_id, business_id)`; la base de datos lo rechaza.
- **2.5** `Session.role` es el rol de la membresía correspondiente al `Session.businessId`, tomado como *snapshot* en el momento del login o del cambio de negocio. Se acepta una desactualización menor durante la sesión (no se revalida en cada petición); el snapshot se autocorrige en el siguiente login o cambio de negocio.
- **2.6** Las decisiones de autorización se basan en **capacidades**, no en comparaciones directas de strings de rol. `lib/services/permissions.ts` es la única fuente de verdad: expone helpers de capacidad (por ejemplo `canViewPayroll(role)`, `canViewAuditLog(role)`).
- **2.7** Una capacidad sin mapeo explícito para un rol dado devuelve `false` (**denegar por defecto**; nunca falla abriéndose). Un helper de capacidad es determinista, sin efectos secundarios ni acceso a base de datos.
- **2.8** **Aislamiento absoluto entre negocios:** el sistema nunca resuelve datos de un `business_id` para el que el `userId` de la sesión no tenga una fila de membresía, sin importar el rol ni qué `business_id` solicite el cliente.
- **2.9** Capacidad `viewPayroll` (Nómina): solo `admin` la obtiene. Se aplica de extremo a extremo — la página de Nómina responde 404 y sus rutas API responden `403 FORBIDDEN` a una sesión sin la capacidad.
- **2.10** Capacidad `viewAuditLog` (registro de auditoría): solo `admin` la obtiene; `worker` la tiene denegada. Es una capacidad **a nivel de widget** (ver regla 12.6), no un guardián a nivel de página.
- **2.11** Inventario **no** tiene restricción de rol: cualquier usuario autenticado puede verlo y usarlo (ver regla 11.11).

## 3. Navegación por Rol

- **3.1** La capa de servidor es la **autoridad**: cualquier página o ruta API que requiera una capacidad ausente en la sesión debe denegar la petición en la propia capa de página/ruta (página → 404, ruta API → `403 FORBIDDEN`), independientemente del estado de la UI de navegación.
- **3.2** Existe un helper reutilizable para enforcement de página y otro para enforcement de ruta API, ambos construidos sobre el mismo chequeo de capacidad; ninguna página o ruta implementa su propia lógica de autorización en línea.
- **3.3** Las superficies de navegación (barra lateral y navegación inferior) filtran, antes de renderizar, cualquier ítem que enlace a una capacidad que el rol de la sesión no posee. Un `worker` sin una capacidad no ve el ítem de navegación correspondiente en ninguna superficie.
- **3.4** El filtrado de navegación es un **complemento de UX, no una frontera de seguridad**: siempre debe ir acompañado del enforcement de servidor. Ocultar un ítem de menú nunca se considera protección suficiente, porque el usuario puede navegar directamente a la URL subyacente.

## 4. Negocios (Perfil y Cambio de Negocio)

### Perfil del negocio (editable)

- **4.1** La pantalla "Negocio" muestra únicamente el registro del negocio cuyo `id` coincide con el `business_id` de la sesión: nombre, teléfono, correo, dirección y moneda. Nunca se muestran datos de otro negocio.
- **4.2** Cualquier intento de acceder o editar el perfil de un negocio distinto al de la sesión responde como si el recurso no existiera (sin fuga de datos), sin importar el id solicitado.
- **4.3** El perfil de negocio es **editable** (nombre, teléfono, correo, dirección y moneda) vía `PATCH /api/business` y un formulario en la pantalla "Negocio". El `business_id` objetivo de la actualización siempre se resuelve desde la sesión — nunca desde el cliente. El esquema de validación (`lib/schemas/business.ts`) es estricto: rechaza cualquier campo no editable (`business_id`, `id`, campos de auditoría). La edición está restringida a la capacidad `editBusinessProfile`, que solo obtiene `admin` — `worker` ve el perfil en modo solo lectura y `PATCH /api/business` responde `403 FORBIDDEN` a una sesión sin la capacidad (control autoritativo en `updateBusinessProfile`, no solo en la UI).
- **4.4** La moneda inicial de un negocio es COP (peso colombiano); es editable a cualquier código de 3 letras.
- **4.5** La tabla `businesses` tiene una columna `enabled_features` (arreglo de claves de funcionalidad, por defecto vacío) para que cambios futuros decidan qué capacidades opcionales están habilitadas por negocio. Actualmente la columna existe pero ninguna capacidad la consulta todavía.
- **4.6** Un negocio puede tener **múltiples miembros** (por ejemplo un `admin` y un `worker`). Todos ven el mismo registro de negocio, siempre resuelto por `session.businessId`.

### Cambio de negocio

- **4.7** El sistema lista todos los negocios en los que el usuario de la sesión tiene membresía, ordenados por fecha de creación de la membresía (ascendente).
- **4.8** **Negocio por defecto al iniciar sesión:** se selecciona de forma determinista la membresía más antigua del usuario (por `created_at` ascendente). Las mismas membresías siempre producen el mismo negocio por defecto.
- **4.9** El endpoint de cambio de negocio verifica que el usuario tenga una membresía en el negocio destino **antes** de emitir cualquier sesión nueva. Un cambio hacia un negocio sin membresía se rechaza (equivalente a 403/no encontrado), no emite cookie nueva y deja la sesión actual intacta.
- **4.10** **Un cambio de negocio nunca escala privilegios:** la nueva sesión toma exactamente el rol de la membresía `(userId, negocio destino)`, nunca el rol arrastrado desde la sesión anterior. Al volver al negocio original se restaura su rol original.
- **4.11** Seleccionar un negocio en el menú del topbar hace POST al endpoint de cambio y, si tiene éxito, dispara un refresco para que todos los datos reflejen el nuevo negocio activo. Si el cambio falla, la UI muestra el error y el negocio activo mostrado no cambia.

## 5. Clientes

- **5.1** Al crear un cliente el `business_id` se resuelve en el servidor; cualquier `business_id` suministrado por el cliente se rechaza (campo desconocido) o se ignora.
- **5.2** Un cliente nuevo se crea con `isActive = true` por defecto.
- **5.3** Solo el nombre es obligatorio; `documentNumber`, `email`, `phone`, `address` y `notes` son opcionales. Se validan longitudes máximas de texto y formato de correo cuando se proporciona.
- **5.4** El `documentNumber` (documento) es texto opcional y **no** tiene restricción de unicidad.
- **5.5** El listado de clientes admite búsqueda por nombre/documento/correo/teléfono (`q`), filtro por `status` (`active`/`inactive`) y paginación (`page` mínimo 1, `pageSize` máximo 50).
- **5.6** El detalle de un cliente incluye valores calculados en el servidor: total facturado, total pagado, saldo pendiente, facturas recientes y pagos recientes — todos derivados solo de las facturas y pagos de ese negocio.
- **5.7** Solicitar el detalle de un cliente que pertenece a otro negocio responde `NOT_FOUND`: nunca se revela la existencia de datos entre negocios.
- **5.8** La edición de un cliente (`PATCH`) solo permite campos descriptivos e `isActive`. Rechaza `business_id`, saldos, campos de auditoría, cargas vacías y campos desconocidos.

## 6. Facturación

Las facturas son **internas / no fiscales**. No hay facturación electrónica DIAN.

### Creación y valores calculados

- **6.1** Crear una factura requiere un `customerId` existente que pertenezca al mismo negocio, y al menos un ítem.
- **6.2** Cada ítem debe tener `quantity > 0` y `unitPrice >= 0`.
- **6.3** El servidor calcula todos los valores derivados: `line_total = quantity * unitPrice` (en centavos enteros, redondeo *round-half-up*), `subtotal = suma(line_totals)` y `total = subtotal`. En el MVP **no hay impuestos ni descuentos**.
- **6.4** El servidor genera el `number` de la factura de forma atómica y único por negocio, y asigna el `status` inicial.
- **6.5** El sistema **ignora o rechaza** cualquier `number`, `status`, `subtotal`, `total`, `line_total` o `business_id` que venga del cliente. Si el payload trae `status: "paid"` y `total: 999999`, la factura se crea con el `total` calculado por el servidor y estado inicial `pending`; los valores falsificados se descartan.
- **6.6** La creación de la factura (cabecera + ítems) es **atómica**: o se persisten todas las filas o ninguna. Un ítem inválido (por ejemplo `quantity <= 0` o `unitPrice` negativo) rechaza toda la petición con `VALIDATION_ERROR` sin persistir nada.
- **6.7** Un `customerId` que pertenezca a otro negocio provoca rechazo y no se crea factura.

### Estado y saldo

- **6.8** El **saldo** de una factura se calcula como `total − suma de pagos` (`balance = total − paid_amount`).
- **6.9** El **estado** de una factura se calcula en el servidor, en este orden exacto de precedencia:
  1. `balance = 0` → `paid`
  2. `balance > 0` **y** existe al menos un pago → `partially_paid`
  3. `balance > 0`, sin pagos, y `due_date` es nula o futura → `pending`
  4. `balance > 0`, sin pagos, y `due_date` ya pasó → `overdue`
- **6.10** La regla 2 se evalúa **antes** que la 4: una factura con algún pago y saldo pendiente que además esté vencida permanece `partially_paid`, nunca `overdue`. El estado `overdue` solo tiene prioridad sobre `pending`.
- **6.11** El estado **nunca** se acepta desde el cliente. Se recalcula en cada lectura a partir de los datos actuales: si el `status` persistido difiere del calculado, la respuesta usa el **calculado** (por ejemplo, una factura persistida como `pending` cuya fecha de vencimiento ya pasó y con saldo > 0 se devuelve como `overdue`).
- **6.12** El detalle de factura (`GET /api/invoices/{id}`) devuelve factura, cliente, ítems, pagos, `paid_amount`, `balance` y estado recalculado en el momento de la lectura.
- **6.13** El listado de facturas admite filtros opcionales por `customerId`, `status`, `from`, `to` y paginación (`page` mínimo 1, `pageSize` máximo 50), e incluye por factura: cliente, `total`, `paid_amount`, `balance` y estado calculado.

### Regla de bloqueo de edición (edit-lock)

- **6.14** Una factura solo puede editarse mientras **no tenga ningún pago registrado** (`paid_amount = 0`, equivalentemente `balance = total`). Una vez registrado el primer pago, la factura queda **bloqueada permanentemente** para edición.
- **6.15** Al editar una factura sin pagos, el servidor reemplaza los ítems y **recalcula** `subtotal`/`total`/`status` desde los ítems enviados, exactamente como en la creación, y mantiene el `number` **inmutable**.
- **6.16** Cualquier intento de editar una factura con al menos un pago (incluida una totalmente pagada, `balance = 0`) se rechaza con un error específico de bloqueo de edición (**no un 500 genérico**) y **cero mutación**: no cambia ningún ítem, campo de cabecera ni valor derivado.
- **6.17** En la edición se descartan los mismos campos falsificados que en la creación (`status`, `total`, `subtotal`, `number`, `business_id`); se usan los valores calculados por el servidor.
- **6.18** El bloqueo de edición se aplica en **dos capas independientes** (defensa en profundidad): la capa de servicio (`updateInvoice`) verifica cero pagos antes de delegar, y la capa de repositorio (`InvoiceRepository.update`) vuelve a verificar cero pagos por su cuenta antes de persistir. Un fallo en una sola capa no basta para saltarse la invariante. Este blindaje existe porque los pagos son *append-only* y la garantía anti-sobrepago asume que el `total` de una factura nunca se reduce después de haber cobrado contra ella.

## 7. Pagos

- **7.1** Una factura puede tener **múltiples** pagos; un pago pertenece a **una sola** factura.
- **7.2** Se permiten pagos parciales y pago total.
- **7.3** Cada pago requiere `amount > 0`.
- **7.4** **Guardia anti-sobrepago:** se rechaza cualquier pago cuyo `amount` exceda el `balance` actual de la factura, calculado en el momento de la petición. Un pago igual al saldo restante es aceptado y deja la factura en `paid`.
- **7.5** Un sobrepago se rechaza con error de validación/conflicto; no se persiste ningún pago y el total pagado y el estado de la factura permanecen sin cambios. Cualquier pago con `amount > 0` contra una factura ya pagada (`balance = 0`) se rechaza porque necesariamente excede el saldo cero.
- **7.6** El `customer_id` del pago se **deriva de la factura**; cualquier `customer_id`, `business_id`, saldo o estado suministrado por el cliente se ignora o rechaza.
- **7.7** El registro de un pago es una **operación atómica** que bloquea/lee de forma consistente la factura objetivo, recalcula `paid_amount`/`balance`, valida `amount <= balance`, deriva `customer_id`, inserta el pago y recalcula el estado — todo antes de liberar el bloqueo. Así, peticiones concurrentes sobre la misma factura **nunca** pueden combinarse para exceder el total: si llegan dos pagos concurrentes individualmente válidos pero que combinados superan el saldo, solo uno tiene éxito y el otro se rechaza.
- **7.8** Tras registrar un pago, la respuesta refleja el estado de la factura recalculado según las reglas de la sección 6 (por ejemplo, un pago parcial sobre una factura `pending` la deja `partially_paid`).
- **7.9** Se guarda opcionalmente el método de pago y una nota. El listado de pagos admite filtros por `customerId`, `invoiceId`, `from`, `to` y paginación (`page` mínimo 1, `pageSize` máximo 50).
- **7.10** No existe operación de edición ni de borrado de pagos: son un registro histórico *append-only*.

## 8. Comprobantes (Vistas Imprimibles)

- **8.1** El sistema ofrece una vista imprimible de la factura que muestra datos del negocio, datos del cliente, número de factura, ítems, valores, fechas y el total/saldo/estado calculado actual.
- **8.2** El sistema ofrece un recibo imprimible de un pago registrado que muestra datos del negocio, datos del cliente, una referencia del pago, monto, fecha y método.
- **8.3** Solicitar la vista imprimible de una factura o pago de otro negocio se deniega (no encontrado), consistente con el aislamiento entre negocios.
- **8.4** **Sin aviso DIAN / autoridad tributaria:** ningún comprobante imprimible (factura ni recibo de pago) ni la exportación PDF de factura muestra texto de aviso DIAN o de autoridad tributaria — incluido, entre otros, el texto "Documento interno, no valido como factura electronica DIAN." Tampoco se muestra ningún aviso legal o de cumplimiento en su lugar.

## 9. Gastos (Egresos)

- **9.1** Un gasto almacena `business_id`, `category`, `description`, `amount`, `date` y `notes` opcional.
- **9.2** La `category` de un gasto está restringida a exactamente dos valores: `nomina` u `otro`. Cualquier otro valor (por ejemplo `viajes`) se rechaza con `VALIDATION_ERROR` sin persistir fila alguna. Ambos valores válidos se aceptan.
- **9.3** El `amount` de un gasto debe ser un **entero positivo** en unidades menores (centavos). Se rechazan montos cero, negativos o no enteros.
- **9.4** Crear un gasto requiere `category`, `description`, `amount` y `date`; `notes` es opcional. El `business_id` se deriva de la sesión.
- **9.5** Existe una función de servicio `createExpense(business_id, data)` reutilizable e independiente de la ruta HTTP, para que otros llamadores (por ejemplo el módulo de Nómina) puedan crear gastos directamente. La ruta `POST /api/expenses` se limita a resolver el `business_id` y delegar en ella; no contiene lógica de creación de gastos.
- **9.6** El listado de gastos admite filtros por `category`, `from`, `to` y paginación (`page` mínimo 1, `pageSize` máximo 50).
- **9.7** La UI ofrece un formulario "Crear gasto" (categoría, descripción, monto, fecha) con validación en el cliente que replica el esquema del servidor, más revalidación en el servidor al enviar. Si el usuario envía con `amount <= 0` o un campo requerido faltante, el formulario muestra un error y no se envía ninguna petición al servidor. Un envío válido crea el gasto y aparece en la lista de gastos recientes sin recargar la página.

## 10. Nómina

La Nómina permite a un `admin` registrar empleados y pagos de nómina. Está restringida a `admin` (ver reglas 2.9 y 3.1).

### Empleados

- **10.1** Un empleado almacena `business_id`, `name`, `base_salary` (entero, unidades menores), `active` (booleano), `created_at`, `updated_at`.
- **10.2** Un empleado nuevo se crea con `active = true`.
- **10.3** Nombre, salario base y estado activo son **editables** mediante actualización. **No existe borrado** de empleados: solo se alterna el flag `active` (activo/inactivo).
- **10.4** Un empleado de otro negocio nunca aparece en listados y consultarlo directamente devuelve "no encontrado".

### Pagos de nómina

- **10.5** Un pago de nómina almacena `business_id`, `employee_id` (FK), `amount` (entero positivo, unidades menores), `period_type` (`quincenal` o `mensual`), `period_start`, `period_end`, `payment_date`, `notes` opcional y `created_at`.
- **10.6** El `amount` de un pago de nómina debe ser un **entero positivo**. Se rechazan montos cero, negativos o no enteros con `VALIDATION_ERROR` antes de persistir.
- **10.7** Los pagos de nómina son **append-only**: no existe operación de actualización ni de borrado. Una vez creado, un pago de nómina es permanente.
- **10.8** **El período se deriva de forma determinista** a partir de `period_type` y una fecha de referencia:
  - `mensual`: del día 1 al último día del mes de referencia (por ejemplo, referencia `2026-02-10` → `2026-02-01` a `2026-02-28`).
  - `quincenal`, primera mitad: del 1 al 15 si la fecha de referencia cae en esa mitad (por ejemplo `2026-07-05` → `2026-07-01` a `2026-07-15`).
  - `quincenal`, segunda mitad: del 16 al último día del mes si la fecha cae en esa mitad (por ejemplo `2026-07-20` → `2026-07-16` a `2026-07-31`; `2028-02-20` → `2028-02-16` a `2028-02-29` en año bisiesto).
- **10.9** El sistema **no persiste** un campo de cantidad de días: siempre es derivable como `period_end − period_start + 1`.
- **10.10** **Enlace atómico pago-a-gasto:** `createPayrollPayment` crea la fila de `payroll_payments` **y** un gasto vinculado con `category: 'nomina'` (mediante la función reutilizable `createExpense`) como una **única operación todo-o-nada**. Si cualquiera de las dos inserciones falla, no persiste ninguna. Así la nómina aparece en la pestaña Egresos del dashboard **sin doble registro**.
- **10.11** **Sin corrección ni anulación:** no existe operación de corrección, anulación (*void*) ni asiento compensatorio para un pago de nómina erróneo o su gasto vinculado. Un registro equivocado permanece como registro histórico permanente.

## 11. Inventario

El inventario mantiene un catálogo de productos por negocio y un libro de movimientos de stock. Su cantidad y valor **siempre se calculan** a partir de un libro de movimientos *append-only*, nunca desde una columna almacenada — igual que el `balance`/`status` de las facturas se calculan desde los pagos.

### Productos

- **11.1** Un producto almacena `business_id`, `name`, `sku` (opcional), `unit_cost` (entero positivo, unidades menores), `min_stock_threshold` (entero no negativo), `active` (booleano, por defecto `true`), `created_at`, `updated_at`.
- **11.2** Nombre, sku, costo unitario, umbral mínimo de stock y estado activo son **editables**. **No existe borrado** de productos: solo se alterna el flag `active`.
- **11.3** El `sku` es texto libre opcional con longitud máxima razonable y **sin** restricción de unicidad: dos productos del mismo negocio pueden compartir el mismo sku. Un producto puede crearse sin sku (queda nulo/ausente).
- **11.4** Un producto de otro negocio nunca aparece en listados y consultarlo directamente devuelve "no encontrado".

### Movimientos de inventario

- **11.5** Un movimiento almacena `business_id`, `product_id` (FK), `type` (`in` o `out`), `quantity` (entero positivo), `notes` opcional y `created_at`.
- **11.6** Los movimientos son **append-only**: no existe operación de actualización ni de borrado. Una vez creado, un movimiento es permanente.
- **11.7** La `quantity` de un movimiento debe ser un **entero positivo**. Se rechazan cantidades cero, negativas o no enteras con `VALIDATION_ERROR`. `notes` es opcional (queda nulo si se omite).

### Cantidad y valor calculados

- **11.8** La cantidad actual y el valor total de un producto **siempre se calculan** en el momento de la lectura sumando sus movimientos (`in` suma, `out` resta; valor total = cantidad calculada × `unit_cost`). La tabla `products` **no** persiste ninguna columna de cantidad ni de valor. Ejemplo: un producto con un `in` de 10 y un `out` de 3 tiene cantidad calculada 7 y valor `7 × unit_cost`.
- **11.9** **Guardia de piso en cero (floor-at-zero), atómica:** un movimiento `out` que dejaría la cantidad calculada por debajo de cero se **rechaza atómicamente con cero mutación** (`VALIDATION_ERROR`); nunca se registra un movimiento parcial. Un `out` que lleva la cantidad exactamente a 0 sí se acepta. Este es el mismo patrón que la guardia anti-sobrepago de los pagos.
- **11.10** **Bandera de stock bajo por producto:** la fila de un producto en el reporte se marca como stock bajo cuando su **propia** cantidad calculada es menor que su **propio** `min_stock_threshold`. La comparación usa el umbral individual de cada producto, nunca un valor global o compartido (dos productos con la misma cantidad pueden tener distinto resultado según su umbral).

### Reglas de acceso y UI de inventario

- **11.11** Cualquier usuario autenticado, **independientemente de su rol**, puede ver y usar Inventario (productos y movimientos). No hay chequeo de capacidad que bloquee `/inventario`, `/api/products` ni `/api/inventory-movements` — a diferencia de la restricción admin-only de Nómina.
- **11.12** El selector de producto del formulario "Registrar movimiento" ofrece **solo productos activos** (igual que el formulario de Nómina solo ofrece empleados activos).

## 12. Auditoría (Audit Log)

Rastro de auditoría *append-only* y por negocio que registra mutaciones de facturas, mostrado a administradores mediante el widget `<MovementsPanel>` en la página de detalle de factura.

- **12.1** Cada fila de `audit_log` lleva un `business_id` resuelto de la sesión, nunca del cliente.
- **12.2** El registro de auditoría es **solo insertar y leer/listar**: no existe operación de actualización ni de borrado de filas de `audit_log`.
- **12.3** `entity_type` y `action` se almacenan como **texto libre sin restricción CHECK** (elección intencional de extensibilidad): fases futuras pueden instrumentar otras entidades/acciones sin migración. Un valor no reconocido (por ejemplo `action = "employee_created"`) se acepta.
- **12.4** **Los inserts de auditoría son best-effort, no transaccionales** con su mutación desencadenante. El insert de auditoría se ejecuta **después** de que la mutación ya se confirmó, y **nunca** va en la misma transacción atómica. Un fallo al escribir la fila de auditoría **no** revierte ni afecta el resultado de la mutación. Limitación aceptada y documentada: un fallo entre el commit de la mutación y el insert de auditoría puede dejar una mutación sin fila de auditoría correspondiente.
- **12.5** **Eventos instrumentados en esta fase (exactamente tres, todos con `entity_type = "invoice"`):**
  - `invoice_created` — tras crear una factura con éxito.
  - `invoice_updated` — tras editar con éxito una factura editable (sin pagos).
  - `payment_recorded` — tras registrar con éxito un pago contra una factura.

  Cada fila fija `entity_id` al id de la factura afectada. Ninguna otra mutación (Nómina, Inventario u otro dominio) se instrumenta en esta fase.
- **12.6** **`<MovementsPanel>` es una compuerta a nivel de widget, no de página.** El panel se renderiza solo cuando `can(session.role, "viewAuditLog")` es verdadero, evaluado en el sitio de llamada dentro de la página de detalle de factura. Es un render condicional en el sitio de llamada, **no** un guardián de página tipo `requireCapabilityOrNotFound`: la página de detalle de factura **sigue siendo accesible y funcional** para sesiones `worker` (responde 200, detalle completo), solo se omite el panel; la página **no** se convierte en 404 ni se bloquea.
- **12.7** La consulta del panel permanece acotada a la factura y al negocio: lee solo filas con `entity_type = "invoice"`, `entity_id` de la factura vista y `business_id` de la sesión.

## 13. Dashboard

- **13.1** El dashboard se organiza en dos pestañas alcanzables desde una sola página sin recarga completa: **Ingresos** y **Egresos**.
- **13.2** Todas las cifras del dashboard se calculan en el servidor en el momento de la petición a partir del estado actual de facturas/pagos/gastos, usando las mismas reglas de estado y saldo que la facturación. Nunca se sirven desde campos persistidos obsoletos (por ejemplo, una factura recién vencida aparece en `overdueInvoices` sin ningún paso de recálculo aparte).

### Pestaña Ingresos

- **13.3** `GET /api/dashboard/summary` devuelve `pendingBalance` (saldo pendiente por cobrar), `paidThisMonth` (pagado este mes), `overdueInvoices` (conteo de facturas vencidas), `recentPayments` (pagos recientes) y `topDebtors` (clientes con mayor saldo pendiente), computados exclusivamente desde los datos del negocio de la sesión.
- **13.4** La pestaña Ingresos muestra esos cinco elementos y ofrece las acciones "Crear cliente" y "Crear factura".

### Pestaña Egresos

- **13.5** La pestaña Egresos muestra `totalThisMonth` (total de gastos del mes), `byCategory` (desglose por categoría: Nómina / Otro) y `recentExpenses` (gastos recientes), computados en el servidor exclusivamente desde los gastos del negocio de la sesión. Ofrece la acción "Crear gasto".
- **13.6** Cada sección de Egresos (total del mes, por categoría, lista reciente) hace *streaming* de forma independiente mediante su propio `<Suspense>`, y no bloquea el render de la pestaña Ingresos aunque una consulta de Egresos sea más lenta.
- **13.7** **Estado vacío de Egresos:** un negocio sin gastos muestra un estado cero/vacío (totales en cero, desglose por categoría en cero para ambas categorías, lista reciente vacía), nunca un error.

## 14. Exportación del Dashboard

- **14.1** `GET /api/dashboard/export?format=xlsx|pdf` requiere una sesión autenticada (**cualquier rol** — sin restricción de rol/permiso adicional más allá de lo que ya exige el dashboard) y devuelve el conjunto completo de datos del dashboard para el negocio de la sesión, computado en el servidor en el momento de la petición.
- **14.2** La exportación cubre **todas las secciones de ambas pestañas, sin filtros ni rangos de fecha**:
  - **Ingresos:** KPIs (saldo pendiente, pagado este mes, conteo de vencidas), `saldo por estado`, `mayores saldos`, `pagos por mes`, `facturas vencidas`, `mayores deudores`, `pagos recientes`.
  - **Egresos:** KPIs (total este mes), `gastos por categoria`, `gastos recientes`.
- **14.3** La exportación **no introduce nueva lógica de negocio, cambios de esquema ni capacidad/permiso**: es una agregación de solo lectura y formateo de las funciones de servicio de dashboard existentes. Las etiquetas de categoría coinciden exactamente con el dashboard (con acentos), reutilizando la fuente de etiquetas existente en lugar de duplicarla.
- **14.4** **Formato Excel (`xlsx`):** responde 200 con `Content-Type` de hoja de cálculo Office Open XML y `Content-Disposition: attachment` nombrando un archivo `.xlsx`. El libro contiene **una hoja por sección** de ambas pestañas, cada una con fila de encabezado con el estilo estándar (`styleHeader`), poblada solo con datos del negocio.
- **14.5** **Formato PDF (`pdf`):** responde 200 con `Content-Type: application/pdf` y `Content-Disposition: attachment` nombrando un archivo `.pdf`. El documento es **un único reporte continuo** con un encabezado y una tabla por sección de ambas pestañas (no una página por sección), fluyendo entre saltos de página según se necesite.
- **14.6** Un `format` faltante o distinto de `xlsx`/`pdf` se rechaza con `VALIDATION_ERROR` (HTTP 400) y no produce ningún archivo.
- **14.7** Un negocio en estado vacío (sin facturas, pagos ni gastos) **exporta con éxito** (200) en ambos formatos, con cada sección presente pero vacía/en cero, nunca un error.

---

## Apéndice Técnico — Convenciones Transversales

Estas convenciones sustentan la corrección de todos los dominios anteriores.

### A. Dinero — centavos enteros

- **A.1** Todo monto monetario se almacena y computa como **entero en unidades menores** (centavos de COP), de extremo a extremo (capa mock, servicios, esquemas). Nunca como decimal/float.
- **A.2** El redondeo, cuando se necesita, es **round-half-up** y se aplica en un **único sitio**: el cálculo de `line_total` de un ítem de factura. No se dispersa lógica de redondeo en ningún otro lugar. (Implementación: `roundHalfUp(x) = Math.floor(x + 0.5)`.)
- **A.3** La `quantity` de un ítem de factura puede ser fraccionaria (por ejemplo horas o kg); el `unitPrice` es entero en centavos. El redondeo half-up del `line_total` ocurre antes de sumarlo al `subtotal`/`total`.
- **A.4** El formateo de moneda (COP, sin decimales, locale `es-CO`) ocurre **solo en el borde de presentación** (UI). Servicios, esquemas y la capa mock nunca formatean moneda.
- **A.5** La conversión de "pesos enteros tecleados por un humano" a centavos ocurre en un **único sitio** (`pesosToCents`), que normaliza la imprecisión de punto flotante IEEE-754 (mediante `toFixed(2)`) antes del redondeo final, evitando errores como que `1.005 * 100` se redondee hacia abajo. Asume montos `>= 0`; los montos negativos deben rechazarse aguas arriba (esquema del cliente y del servidor ya lo hacen).

### B. Fechas — zona horaria local

- **B.1** Las fechas que el usuario percibe como "hoy" se computan **siempre desde getters de hora local**, nunca desde `Date.prototype.toISOString()` (que siempre es UTC).
- **B.2** El locale objetivo es Colombia (UTC-5, sin horario de verano). Usar UTC pre-cargaría el día equivocado para un usuario que llena un formulario por la tarde/noche (ya sería "mañana" en UTC). El helper `todayIsoDate()` devuelve `YYYY-MM-DD` local.

### C. Numeración de facturas

- **C.1** El `number` de factura se genera de forma **atómica y única por negocio**, con un contador por negocio (tabla `invoice_sequences`), a prueba de carreras bajo el bloqueo de fila de Postgres. Dos peticiones concurrentes para el mismo negocio reciben cada una un número distinto; nunca se produce un número duplicado.
- **C.2** El formato del número es `FAC-` seguido del valor del contador rellenado con ceros a la izquierda hasta 4 dígitos (por ejemplo `FAC-0001`, `FAC-0042`). *(Detalle de formato tomado del código — ver nota al final.)*
- **C.3** El `number` es inmutable: nunca cambia tras la creación, tampoco al editar una factura sin pagos.

### D. Concurrencia y atomicidad

- **D.1** Las escrituras que deben serializar sobre la misma fila de factura (guardia anti-sobrepago de pagos y guardia de bloqueo de edición) usan un patrón de **transacción de dos sentencias con `FOR UPDATE`**: la sentencia 1 adquiere y mantiene el bloqueo de la fila de `invoices` durante toda la transacción; la sentencia 2 (guardia + insert) corre después, tomando una lectura de snapshot fresco solo tras resolverse el bloqueo. Un `FOR UPDATE` inline de una sola sentencia sobre una subconsulta correlacionada a otra tabla es insuficiente (verificado empíricamente contra Postgres 16). El mismo patrón de dos sentencias protege la guardia floor-at-zero del inventario.
- **D.2** La creación de una factura (cabecera + ítems) y el enlace pago-de-nómina-a-gasto son operaciones **todo-o-nada**: o se persisten todas las filas o ninguna.

### E. Formato de error de la API

- **E.1** Las respuestas de error de la API siguen un formato estándar con `error.code`. Códigos usados a lo largo del sistema: `UNAUTHENTICATED` (401, sin sesión), `FORBIDDEN` (403, capacidad ausente), `VALIDATION_ERROR` (400, entrada inválida), `NOT_FOUND` (404, incluido el uso deliberado para no revelar existencia entre negocios).

### F. Infraestructura de esquema (contexto)

- **F.1** Todo cambio de esquema aterriza como un archivo de migración versionado (`node-pg-migrate`); no se introduce DDL ad-hoc en tiempo de ejecución. El código de aplicación en runtime nunca importa `node-pg-migrate` ni `pg`.
- **F.2** El backend mock funciona de forma autónoma sin conexión a base de datos, de modo que `npm run dev`/`npm run build` no requieren base de datos cuando `POSTGRES_URL` no está configurado. La capa de servicio mock hace hoy de equivalente funcional de las futuras políticas RLS de Supabase que restringirán cada tabla a su `business_id` propietario.

---

## Nota sobre reglas tomadas directamente del código

La mayoría de las reglas anteriores están respaldadas por las especificaciones en `openspec/specs/`. Las siguientes se tomaron **directamente del código** porque su detalle exacto no está capturado en ninguna especificación (conviene confirmar que quedaron fielmente reflejadas):

- **Formato del número de factura `FAC-####` (regla C.2)** — la especificación de facturas solo dice "número generado atómicamente y único por negocio". El prefijo `FAC-` y el relleno a 4 dígitos provienen de `lib/db/invoice-repo.ts` (`FAC-${String(seq).padStart(4, "0")}`).
- **Detalle de `pesosToCents` y normalización de float (regla A.5)** — la especificación fija centavos enteros y round-half-up en `line_total`, pero la conversión pesos→centavos con normalización vía `toFixed(2)` es una convención únicamente de código (`lib/money.ts`).
- **Convención de fechas en hora local (Apéndice B)** — no está en ninguna especificación de dominio; es una convención de código documentada en `lib/dates.ts`.
- **Mecánica de la transacción de dos sentencias con `FOR UPDATE` (regla D.1)** — las especificaciones garantizan el *comportamiento* atómico anti-sobrepago y floor-at-zero; el mecanismo concreto y su verificación empírica provienen de `lib/db/payment-repo.ts`, `lib/db/invoice-repo.ts` y `lib/db/client.ts`.
- **Estado `paid` con `balance <= 0` (regla 6.9)** — la especificación enuncia `balance = 0 → paid`; el código (`lib/services/status.ts`) usa `balance <= 0` (defensivo ante un hipotético saldo negativo), consistente con la guardia anti-sobrepago que en la práctica impide `balance < 0`.
</content>
</invoke>
