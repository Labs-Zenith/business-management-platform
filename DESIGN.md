# Sistema de diseño — Panel de Negocio

> Fuente de verdad del estilo visual **implementado** en este proyecto. Al construir o modificar UI, **usa siempre estos tokens y utilidades** — nunca colores hex crudos ni tamaños de fuente sueltos. El código canónico vive en `app/globals.css` (Tailwind v4, CSS-first, sin config JS); las fuentes se cargan en `app/layout.tsx`. Este doc describe ese código.

## Principios

- **Tema oscuro único y forzado.** `<html>` lleva `dark` fijo (ver `app/layout.tsx`); no hay toggle claro/oscuro. La paleta clara (`:root` / `.light`) existe solo para los comprobantes imprimibles bajo `app/(print)/`.
- **Verde como acento reservado.** El verde spring `#00FF7F` (`--brand`) no es el color de acción principal: los botones primarios se mantienen neutros (casi blanco sobre casi negro). El verde se reserva para foco, estado activo, éxito y cifras positivas.
- **Color = atención.** Se usa color solo para estados con significado (éxito / advertencia / info / error). Los estados booleanos de identidad que no son "de atención" se mantienen neutros.
- **Profundidad por hairlines, no por sombras.** Bordes de 1px + contraste de superficie; se evitan drop shadows.
- **Tokens semánticos siempre.** Los componentes usan `bg-primary`, `text-muted-foreground`, `text-success`, etc. — nunca `text-red-500` ni `#00ff7f` inline.

## Tipografía

Fuentes cargadas con `next/font/google` en `app/layout.tsx`:

| Rol | Familia | Variable CSS | Utilidad Tailwind |
|---|---|---|---|
| Display / titulares | **Inter** | `--font-inter` → `--font-display` | `font-display`, `font-heading` |
| Texto (sans) | **Inter** | `--font-inter` → `--font-sans` | `font-sans` (default en `body`) |
| Monoespaciada | **Geist Mono** | `--font-geist-mono` → `--font-mono` | `font-mono` |

> Inter sustituye a las tipografías propietarias de Linear (Linear Display/Text). Si algún día se licencian, se cargan con `next/font/local` en `app/fonts/` y se reasignan `--font-inter`/`--font-display` sin tocar nada más.

### Escala tipográfica (estilo Linear)

Cada token emite una utilidad `text-*` que ya incluye tamaño + interlineado + tracking + peso. **Úsalas en vez de combinar `text-2xl font-semibold tracking-tight` a mano.** Definidas en `@theme inline` de `app/globals.css`.

| Utilidad | Tamaño | Interlineado | Tracking | Peso | Uso |
|---|---|---|---|---|---|
| `text-display-xl` | 80px | 1.05 | -3px | 600 | Hero / cifras enormes |
| `text-display-lg` | 56px | 1.10 | -1.8px | 600 | Display grande |
| `text-display-md` | 40px | 1.15 | -1px | 600 | Display medio |
| `text-headline` | 28px | 1.20 | -0.6px | 600 | **Título de página (`<h1>`)** |
| `text-card-title` | 22px | 1.25 | -0.4px | 500 | Títulos de sección/tarjeta |
| `text-subhead` | 20px | 1.40 | -0.2px | 400 | Subtítulos |
| `text-body-lg` | 18px | 1.50 | -0.1px | 400 | Cuerpo grande |
| `text-body` | 16px | 1.50 | -0.05px | 400 | Cuerpo base |
| `text-body-sm` | 14px | 1.50 | 0 | 400 | Cuerpo pequeño / tablas |
| `text-caption` | 12px | 1.40 | 0 | 400 | Leyendas |
| `text-button` | 14px | 1.20 | 0 | 500 | Etiquetas de botón |
| `text-eyebrow` | 13px | 1.30 | 0.4px | 500 | Antetítulos / labels |
| `text-mono` | 13px | 1.50 | 0 | 400 | Datos monoespaciados |

> Las utilidades estándar (`text-sm`, `text-lg`, …) siguen existiendo y no se renombraron. Para UI nueva prefiere la escala de arriba.

## Color

Todos los colores son tokens CSS (`app/globals.css`) mapeados a utilidades Tailwind (`bg-*`, `text-*`, `border-*`) y admiten modificadores de opacidad (`bg-success/15`).

### Paleta oscura — `.dark` (la que se ve en pantalla)

| Token | Hex | Utilidad | Notas |
|---|---|---|---|
| `--background` | `#181717` | `bg-background` | Casi negro cálido — fondo del body |
| `--foreground` | `#f2f1ef` | `text-foreground` | Casi blanco cálido |
| `--card` / `--popover` | `#201f1d` | `bg-card` / `bg-popover` | Superficie elevada |
| `--primary` | `#f2f1ef` | `bg-primary` | **Botón primario = neutro casi blanco** |
| `--primary-foreground` | `#181717` | `text-primary-foreground` | Texto sobre primario |
| `--secondary` / `--muted` | `#262523` | `bg-secondary` / `bg-muted` | Superficies neutras |
| `--muted-foreground` | `#a3a09b` | `text-muted-foreground` | Texto secundario |
| `--accent` | `#2b2a27` | `bg-accent` | Hover neutro |
| `--border` | `#2a2926` | `border-border` | Hairline |
| `--input` | `#343330` | — | Borde de inputs |
| `--ring` | `#00ff7f` | `ring-ring` | **Foco = verde** |
| `--destructive` | `#ff5a5a` | `text-destructive` | Error / rojo |

### Colores de marca y semánticos

| Token | Oscuro (`.dark`) | Claro / impresión | Significado |
|---|---|---|---|
| `--brand` / `-foreground` | `#00ff7f` / `#05130c` | `#05966b` / `#fff` | Acento de marca (verde spring) — reservado |
| `--success` / `-foreground` | `#00ff7f` / `#05130c` | `#05966b` / `#fff` | Éxito, pagado, positivo |
| `--warning` / `-foreground` | `#f5a623` / `#181717` | `#b45309` / `#fff` | Advertencia, pendiente, stock bajo |
| `--info` / `-foreground` | `#5a8dff` / `#05122e` | `#0047AB` / `#fff` | Info, enlaces, cobalto |
| `--destructive` / `-foreground` | `#ff5a5a` / — | `#ee0000` / — | Error, vencido, salida |

Utilidades: `bg-brand`, `text-success`, `border-warning/30`, `text-info`, etc.

> En claro/impresión, el verde y el ámbar se **oscurecen** para legibilidad sobre blanco; en oscuro el cobalto se **aclara** (`#5a8dff`) para que los enlaces contrasten. El cobalto exacto de marca `#0047AB` se usa en fondos rellenos y en impresión.

### Sidebar (tokens propios)

`--sidebar` `#181717` · `--sidebar-foreground` `#f2f1ef` · `--sidebar-accent` `#262523` (fila activa) · `--sidebar-accent-foreground` `#ffffff` · `--sidebar-primary` `#00ff7f` · `--sidebar-border` `#2a2926` · `--sidebar-ring` `#00ff7f`.

### Charts (no usar como estados)

`--chart-1..5` (`#50e3c2` teal, `#0070f3` azul, `#7928ca` morado, `#ff0080` rosa, `#f5a623` naranja) son **exclusivos de gráficas** (series de datos). No los uses como colores de estado — para eso están `success`/`warning`/`info`/`destructive`.

## Radios

`--radius: 0.5rem`. Escala derivada: `rounded-sm` (×0.6) · `rounded-md` (×0.8) · `rounded-lg` (×1) · `rounded-xl` (×1.4) · `rounded-2xl` (×1.8) · `rounded-3xl` (×2.2) · `rounded-4xl` (×2.6, usado por los badges tipo píldora).

## Componentes

### Badge — `components/ui/badge.tsx`

Píldora `rounded-4xl`, `h-5`, `text-xs`, `font-medium`. Variantes disponibles:

| Variante | Aspecto | Uso |
|---|---|---|
| `default` | relleno neutro (primary) | genérico |
| `secondary` | gris neutro | genérico suave |
| `outline` | borde neutro | **estado booleano "off" (Inactivo)** |
| `ghost` / `link` | sin fondo | acciones inline |
| `success` | tinte verde suave | Pagado, Activo, Entrada |
| `warning` | tinte ámbar suave | Pendiente, Stock bajo |
| `info` | tinte cobalto suave | Parcial, informativo |
| `destructive` | tinte rojo suave | Vencido, Salida, error |

Las variantes semánticas siguen el patrón `border-{c}/30 bg-{c}/15 text-{c} dark:border-{c}/40 dark:bg-{c}/20`.

### Estados por tabla (convención vigente)

| Dominio | Estado | Variante |
|---|---|---|
| Facturas | pagada / pendiente / parcial / vencida | `success` / `warning` / `info` / `destructive` (vía `invoice-status-badge.tsx`) |
| Clientes · Nómina · Inventario | Activo / Inactivo | `success` / `outline` (neutro — inactivo no es error) |
| Inventario | Entrada / Salida | `success` / `destructive` |
| Inventario | Stock bajo | `warning` |
| Pagos (método) · Egresos (categoría) | — | texto plano, sin badge (no son estados de atención) |

### Sidebar / navegación

- La fila activa ocupa **casi todo el ancho** del riel: el `<aside>` usa `px-2 py-4` (no `p-4`) y el `<nav>` móvil `px-2`, para que el resaltado no quede tan metido.
- Cada ítem (`components/layout/nav-link.tsx`): `rounded-md px-3 py-2 text-sm font-medium`; inactivo `text-sidebar-foreground/70`.
- Ítem activo: `bg-sidebar-accent text-sidebar-accent-foreground` **+ ícono en verde** (`[&>svg]:text-brand`) — así aparece el acento sin un relleno fuerte.
- Desktop (`dashboard-sidebar.tsx`) y móvil (`mobile-nav-sheet.tsx`) comparten `NavLink`, así que el estilo se mantiene sincronizado.

### Títulos y dinero

- `CardTitle`, `DialogTitle`, `SheetTitle` usan `font-heading` (Inter display). Los `<h1>` de página usan `text-headline`.
- `components/domain/money-amount.tsx` usa `font-mono tabular-nums`. Para deltas +/- usa `text-success` / `text-destructive`.

## Do / Don't

**Do**
- Reserva el verde (`brand`/`success`) para foco, activo, éxito y positivos.
- Usa `text-headline` para títulos de página y las utilidades `text-*` de la escala.
- Colorea solo estados de atención; deja los booleanos de identidad en neutro (`outline`).
- Usa tokens semánticos con opacidad (`bg-warning/15`) — nunca hex crudo.

**Don't**
- No conviertas el verde en el color de todos los botones primarios (dejarían de destacar los acentos).
- No uses `--chart-*` como color de estado.
- No agregues drop shadows para profundidad; usa hairlines (`border-border`).
- No renombres utilidades existentes: los tests validan clases con `toHaveClass`.

## Mapa de archivos

- `app/layout.tsx` — carga de fuentes (Inter + Geist Mono), `dark` forzado, `lang="es"`.
- `app/globals.css` — todos los tokens: `@theme inline` (colores, fuentes, escala tipográfica, radios), `.dark` (pantalla), `:root`/`.light` (impresión). **Código canónico.**
- `components/ui/badge.tsx` — variantes de estado.
- `components/domain/invoices/invoice-status-badge.tsx` — badges de estado de factura.
- `components/layout/nav-link.tsx`, `dashboard-sidebar.tsx`, `mobile-nav-sheet.tsx` — navegación.
- `app/(print)/layout.tsx` — reactiva la paleta clara (`.light`) para comprobantes.
