# Technical Architecture

## Stack definido

- Framework: Next.js con App Router.
- Lenguaje: TypeScript.
- UI: shadcn/ui.
- Estilos: Tailwind CSS.
- Diseno: mobile first.
- Tema inicial: default de shadcn.
- Backend: Next.js Route Handlers bajo `/api`.
- Base de datos: Supabase Postgres.
- Autenticacion: Supabase Auth.
- Documentacion API: OpenAPI/Swagger.
- Validacion: Zod.
- Deploy: Vercel.

## Principios de arquitectura

- Construir como SaaS multi-negocio desde el inicio.
- Mantener el MVP pequeno, pero no desechable.
- Separar UI, validacion, logica de negocio y acceso a datos.
- No confiar en datos sensibles enviados desde el cliente.
- Resolver siempre el negocio desde la sesion autenticada.
- Mantener la logica financiera y el acceso a datos operativos del lado del servidor.
- Tratar las variables `NEXT_PUBLIC_*` como publicas.
- Usar Postgres de forma portable para facilitar migracion futura.
- Evitar dependencias innecesarias para no aumentar complejidad temprana.

## Capas recomendadas

### UI

Pantallas y componentes React usando shadcn/ui y Tailwind. Deben ser responsive desde mobile first.

La UI puede llamar `/api/*` y usar Supabase Auth para login/sesion, pero no debe consultar tablas operativas ni ejecutar calculos autoritativos de saldos.

### Forms

Formularios con validacion client-side ligera y validacion server-side obligatoria con Zod.

### API

Route Handlers de Next.js bajo `/api`. Estos endpoints seran la superficie documentada con Swagger.

### Services

Funciones de negocio para operaciones como crear factura, registrar pago, calcular saldos y resolver estados.

Las operaciones que afecten saldos, pagos o numeracion deben ser atomicas.

### Data access

Funciones server-side que consultan Supabase. Deben recibir el contexto autenticado y nunca operar sin `business_id`.

Los modulos de acceso a datos deben ser server-only y no importarse desde Client Components.

### Database policies

RLS en Supabase para impedir acceso cruzado entre negocios incluso si hay errores en la API.

## Estructura esperada del proyecto

```text
app/
  (auth)/
  (dashboard)/
  api/
components/
  ui/
  layout/
  domain/
lib/
  supabase/
  server/
  schemas/
  services/
  openapi/
docs/
openspec/
  specs/
  changes/
```

`lib/server/` debe contener clientes privilegiados, acceso a datos y helpers de autorizacion. Estos archivos deben usar una guardia server-only cuando se implemente el codigo.

`docs/` vs `openspec/`: `docs/` es la base estable definida en Fase 0 (decisiones de producto, arquitectura, seguridad y API que no cambian con cada tarea). `openspec/specs/` contiene las especificaciones vivas, sincronizadas con el codigo a medida que se implementa. `openspec/changes/` contiene propuestas de cambio en curso (siguiendo el ciclo explore -> propose -> spec -> design -> implement -> verify) hasta que se archivan.

## Manejo de autenticacion

- Supabase Auth maneja usuarios y sesiones.
- El usuario inicia sesion con email y password.
- El administrador crea usuarios beta manualmente.
- Cada usuario tiene un registro en `profiles`.
- `profiles.business_id` define el negocio activo del usuario.

## Multi-negocio

Cada tabla operativa incluye `business_id`.

El backend debe:

1. Leer la sesion.
2. Obtener el perfil del usuario.
3. Resolver `business_id`.
4. Ejecutar operaciones filtradas por ese negocio.

El cliente no debe enviar `business_id` para crear o consultar registros.

El cliente tampoco debe enviar `status`, `subtotal`, `total`, `line_total`, `number` ni `customer_id` al registrar pagos. Esos valores se derivan en servidor.

## Seguridad de endpoints

Todos los endpoints privados deben:

- Requerir sesion valida.
- Resolver perfil y negocio antes de acceder a datos.
- Validar route params, query params y body con Zod.
- Rechazar campos sensibles o desconocidos.
- Responder con `Cache-Control: no-store`.
- Mantener CORS deshabilitado salvo necesidad futura documentada.

Las mutaciones deben:

- Usar metodos no GET.
- Aceptar solo JSON.
- Validar `Origin` o `Referer` contra el origen configurado de la app si dependen de cookies.
- Ejecutar operaciones financieras criticas en transaccion o RPC.

## Frontera de secretos

- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` pueden estar disponibles en cliente.
- La anon key no autoriza por si sola; la proteccion real depende de Auth, RLS y validacion server-side.
- `SUPABASE_SERVICE_ROLE_KEY` nunca debe enviarse al navegador ni usarse en endpoints de usuario.
- Cualquier modulo que lea variables privadas debe vivir en server-only.

## Backend y Swagger

La API se documenta con OpenAPI.

Endpoints requeridos:

- `GET /api/openapi.json`
- `GET /api/docs`

`/api/docs` debe renderizar Swagger UI apuntando a `/api/openapi.json`.

En produccion beta, ambos endpoints de documentacion deben requerir sesion autenticada y no deben exponer secretos ni valores reales de variables de entorno.

La especificacion OpenAPI debe incluir:

- Autenticacion requerida.
- Schemas de request y response.
- Errores comunes.
- Endpoints de clientes, facturas, pagos y dashboard.

## Escalabilidad prevista

La arquitectura debe permitir agregar despues:

- Registro publico.
- Multiples usuarios por negocio.
- Roles y permisos.
- Planes de suscripcion.
- Reportes avanzados.
- PDF generado.
- Recordatorios.
- Integraciones.

Estas funciones no se implementan en el MVP, pero no deben requerir reescribir el modelo base.
