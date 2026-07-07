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
- Usar Postgres de forma portable para facilitar migracion futura.
- Evitar dependencias innecesarias para no aumentar complejidad temprana.

## Capas recomendadas

### UI

Pantallas y componentes React usando shadcn/ui y Tailwind. Deben ser responsive desde mobile first.

### Forms

Formularios con validacion client-side ligera y validacion server-side obligatoria con Zod.

### API

Route Handlers de Next.js bajo `/api`. Estos endpoints seran la superficie documentada con Swagger.

### Services

Funciones de negocio para operaciones como crear factura, registrar pago, calcular saldos y resolver estados.

### Data access

Funciones server-side que consultan Supabase. Deben recibir el contexto autenticado y nunca operar sin `business_id`.

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
  schemas/
  services/
  openapi/
docs/
openspec/
  specs/
  changes/
```

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

## Backend y Swagger

La API se documenta con OpenAPI.

Endpoints requeridos:

- `GET /api/openapi.json`
- `GET /api/docs`

`/api/docs` debe renderizar Swagger UI apuntando a `/api/openapi.json`.

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
