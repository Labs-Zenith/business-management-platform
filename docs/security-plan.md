# Security Plan

## Objetivo

Disenar el MVP con una base segura desde el inicio, especialmente en aislamiento de datos por negocio, autenticacion y manejo de informacion financiera interna.

## Riesgos principales

- Un usuario accede a datos de otro negocio.
- El cliente manipula `business_id` desde el frontend.
- Se registran pagos o facturas sobre recursos ajenos.
- Se exponen llaves de Supabase.
- Se permiten montos invalidos o inconsistentes.
- El sistema se confunde con facturacion electronica oficial.

## Autenticacion

- Usar Supabase Auth.
- Login con email y password.
- Cuentas beta creadas manualmente por el administrador.
- No habilitar registro publico en el MVP.
- Mantener sesiones seguras con helpers oficiales de Supabase para Next.js.

## Autorizacion

Cada usuario debe tener un registro en `profiles` con `business_id`.

Regla central:

> El backend siempre resuelve el negocio desde la sesion. Nunca acepta `business_id` desde el cliente.

## Row Level Security

Activar RLS en:

- `profiles`
- `customers`
- `invoices`
- `invoice_items`
- `payments`

Politicas:

- El usuario solo puede leer registros asociados a su `business_id`.
- El usuario solo puede crear registros dentro de su `business_id`.
- El usuario solo puede actualizar registros dentro de su `business_id`.
- En el MVP, no se requiere borrado fisico; preferir desactivar clientes o anular en una version futura.

## Validacion server-side

Todos los endpoints deben validar con Zod:

- Campos requeridos.
- Tipos.
- Formato de fechas.
- Montos positivos.
- Cantidades mayores a cero.
- Longitud maxima de textos.
- Metodos de pago permitidos si se define enum.

## Reglas de integridad

- No permitir pagos mayores al saldo pendiente.
- No permitir facturas sin items.
- No permitir items con cantidad cero.
- No permitir precios negativos.
- No permitir actualizar recursos de otro negocio.
- No permitir crear pagos sobre facturas pagadas.

## Manejo de secretos

No se deben versionar:

- Supabase service role key.
- Supabase anon key si se decide mantenerla fuera del repo.
- URLs privadas.
- Tokens de Vercel.
- Variables de entorno reales.

Usar:

- `.env.local` para desarrollo.
- Variables de entorno en Vercel para produccion.
- Supabase dashboard para llaves y configuracion.

## Auditoria minima

Cada tabla debe tener:

- `created_at`
- `updated_at`

En una fase posterior se puede agregar:

- `created_by`
- `updated_by`
- historial de cambios.
- eventos de auditoria.

## Aviso legal de documentos

Todo comprobante interno debe mostrar:

> Documento interno de control administrativo. No valido como factura electronica DIAN.

Este aviso reduce el riesgo de confusion tributaria.

## Checklist de seguridad antes de beta

- RLS activo en tablas operativas.
- Politicas probadas con dos negocios distintos.
- Endpoints rechazan requests sin sesion.
- Endpoints rechazan recursos de otro negocio.
- Swagger no expone secretos.
- Variables configuradas fuera del repositorio.
- Comprobantes incluyen aviso DIAN.
