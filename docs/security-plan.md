# Security Plan

## Objetivo

Disenar el MVP con una base segura desde el inicio, especialmente en aislamiento de datos por negocio, autenticacion y manejo de informacion financiera interna.

## Riesgos principales

- Un usuario accede a datos de otro negocio.
- El cliente manipula `business_id` desde el frontend.
- Se registran pagos o facturas sobre recursos ajenos.
- Se exponen llaves de Supabase.
- Se permiten montos invalidos o inconsistentes.
- Se aceptan mutaciones cross-site sin proteccion CSRF/origin.
- Se cachean respuestas privadas y se filtran datos entre usuarios.
- Se usa `SUPABASE_SERVICE_ROLE_KEY` en endpoints de usuario y se salta RLS.
- El sistema se confunde con facturacion electronica oficial.

## Autenticacion

- Usar Supabase Auth.
- Login con email y password.
- Cuentas beta creadas manualmente por el administrador.
- No habilitar registro publico en el MVP.
- Mantener sesiones seguras con helpers oficiales de Supabase para Next.js.
- Las cookies de sesion deben usar atributos seguros en produccion segun Supabase/Next.js: `HttpOnly`, `Secure` bajo HTTPS y `SameSite=Lax` o mas restrictivo si es compatible.

## Autorizacion

Cada usuario debe tener un registro en `profiles` con `business_id`.

Regla central:

> El backend siempre resuelve el negocio desde la sesion. Nunca acepta `business_id` desde el cliente.

Las validaciones de UI solo ayudan a la experiencia. La autorizacion real se aplica siempre en Route Handlers, servicios server-side y politicas RLS.

## Row Level Security

Activar RLS en:

- `businesses`
- `profiles`
- `customers`
- `invoices`
- `invoice_items`
- `payments`

Politicas:

- El usuario solo puede leer registros asociados a su `business_id`.
- El usuario solo puede crear registros dentro de su `business_id`.
- El usuario solo puede actualizar registros dentro de su `business_id`.
- `businesses` solo puede leerse o actualizarse cuando su `id` coincide con el `business_id` del perfil autenticado.
- En el MVP, no se requiere borrado fisico; preferir desactivar clientes o anular en una version futura.

Las politicas deben probarse con al menos dos negocios distintos y deben bloquear consultas cruzadas incluso si una query de aplicacion omite el filtro.

## Validacion server-side

Todos los endpoints deben validar con Zod:

- Campos requeridos.
- Tipos.
- Formato de fechas.
- Montos positivos.
- Cantidades mayores a cero.
- Longitud maxima de textos.
- Metodos de pago permitidos si se define enum.
- UUIDs en parametros de ruta y query.
- `Content-Type: application/json` en mutaciones.
- `Origin` o `Referer` valido contra el origen configurado de la app en mutaciones autenticadas por cookie.
- Rechazo de campos desconocidos sensibles como `business_id`, `status`, `total`, `subtotal`, `line_total`, `number` y campos de auditoria.

## Frontera cliente-servidor

Permitido en cliente:

- Usar Supabase Auth con anon key publica para login, logout y lectura de sesion.
- Llamar endpoints same-origin bajo `/api`.
- Ejecutar validaciones visuales o de UX no autoritativas.

Debe ejecutarse solo en servidor:

- Consultas a tablas operativas.
- Calculo de totales, saldos, estados y numeros de factura.
- Validacion de ownership y `business_id`.
- Registro de pagos y cualquier operacion que cambie saldos.
- Acceso a variables sin prefijo `NEXT_PUBLIC_`.

Los modulos con clientes de base de datos, llaves privadas o logica privilegiada deben vivir en una capa server-only y no importarse desde Client Components.

## Reglas de integridad

- No permitir pagos mayores al saldo pendiente.
- No permitir facturas sin items.
- No permitir items con cantidad cero.
- No permitir precios negativos.
- No permitir actualizar recursos de otro negocio.
- No permitir crear pagos sobre facturas pagadas.
- Registrar pagos en una transaccion o RPC que bloquee la factura y recalcule saldo antes de insertar.
- Generar numeros de factura de forma atomica por negocio.
- Derivar `customer_id` del pago desde la factura, no desde el payload del cliente.

## Manejo de secretos

No se deben versionar:

- Valores reales de Supabase service role key.
- Valores reales de Supabase anon key.
- URLs privadas.
- Tokens de Vercel.
- Variables de entorno reales.

Usar:

- `.env.local` para desarrollo.
- Variables de entorno en Vercel para produccion.
- Supabase dashboard para llaves y configuracion.

Reglas adicionales:

- Cualquier variable `NEXT_PUBLIC_*` se considera publica y visible en el navegador.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` puede exponerse porque es publica por diseno, pero debe estar protegida por RLS.
- `SUPABASE_SERVICE_ROLE_KEY` solo puede usarse en scripts administrativos o procesos server-side explicitamente aislados. No debe usarse en Route Handlers de usuario.
- Nunca registrar en logs cookies, tokens, cabeceras `Authorization`, payloads con contrasenas ni `process.env`.

## API, CSRF y cache

- Mantener CORS deshabilitado por defecto; la app no requiere origenes externos en el MVP.
- Proteger mutaciones autenticadas por cookie con validacion estricta de `Origin` o `Referer` contra `NEXT_PUBLIC_APP_URL` o `APP_ORIGIN`.
- No usar GET para operaciones que cambien estado.
- Responder endpoints privados con `Cache-Control: no-store`.
- No usar caches compartidas para resultados por usuario, negocio o sesion.
- Devolver errores genericos al cliente y registrar detalles solo del lado servidor con redaccion.
- En produccion beta, `/api/docs` y `/api/openapi.json` deben requerir sesion autenticada.

## Headers y frontend

- Configurar headers de seguridad en Next.js o Vercel: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, defensa contra clickjacking, `Referrer-Policy` y `Permissions-Policy` cuando aplique.
- Evitar `dangerouslySetInnerHTML`, `innerHTML`, scripts inline y URLs controladas por usuario.
- Renderizar texto de usuario con React/JSX normal para mantener escaping por defecto.
- No guardar tokens o secretos en `localStorage` o `sessionStorage`.
- Si se agregan scripts de terceros, deben estar justificados, minimizados y cubiertos por CSP; preferir self-hosting o SRI cuando aplique.

## Auditoria minima

Cada tabla debe tener:

- `created_at`
- `updated_at`

En una fase posterior se puede agregar:

- `created_by`
- `updated_by`
- historial de cambios.
- eventos de auditoria.

## Checklist de seguridad antes de beta

- RLS activo en tablas operativas.
- Politicas probadas con dos negocios distintos.
- Endpoints rechazan requests sin sesion.
- Endpoints rechazan recursos de otro negocio.
- Mutaciones rechazan origenes invalidos.
- Endpoints privados usan `Cache-Control: no-store`.
- `SUPABASE_SERVICE_ROLE_KEY` no se usa en endpoints de usuario.
- Swagger no expone secretos.
- Swagger esta protegido por sesion en produccion beta.
- Variables configuradas fuera del repositorio.
