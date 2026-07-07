# Business Management Platform Documentation

Este repositorio documenta la planeacion de un MVP SaaS para control interno de clientes, facturas, pagos y saldos pendientes.

El objetivo de esta etapa es dejar el producto listo para pasar a implementacion tecnica, sin construir todavia la aplicacion.

## Documentos

- [Product plan](product-plan.md): problema, publico objetivo, propuesta de valor y vision.
- [MVP scope](mvp-scope.md): alcance de la primera version y limites explicitos.
- [Technical architecture](technical-architecture.md): stack, capas, decisiones tecnicas y estructura esperada.
- [Database model](database-model.md): entidades, relaciones, estados y reglas de datos.
- [API spec](api-spec.md): endpoints iniciales y contratos generales para Swagger/OpenAPI.
- [Security plan](security-plan.md): autenticacion, RLS, aislamiento por negocio y manejo de secretos.
- [UI/UX flow](ui-ux-flow.md): navegacion, pantallas y flujos mobile first.
- [Testing plan](testing-plan.md): casos de aceptacion funcionales, seguridad, API y responsive.
- [Deployment plan](deployment-plan.md): configuracion de Supabase, Vercel y beta privada.
- [Roadmap](roadmap.md): evolucion posterior al MVP.

## Decisiones principales

- Stack definido: Next.js App Router, TypeScript, shadcn/ui, Tailwind CSS, Supabase y Vercel.
- Backend inicial: Route Handlers de Next.js bajo `/api`.
- Base de datos: Supabase Postgres.
- Autenticacion: Supabase Auth.
- Documentacion API: OpenAPI/Swagger.
- Diseno: mobile first con tema default de shadcn.
- Modelo SaaS: multi-negocio desde el inicio, aunque el MVP tenga un usuario por negocio.
- Primer modo comercial: beta privada con cuentas creadas manualmente.

## No objetivo de esta etapa

No se implementa codigo de aplicacion, base de datos ni despliegue. Estos documentos son la fuente de verdad para la implementacion posterior.
