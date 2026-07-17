# Zenith — Sistema de Diseño

> Fundación visual compartida de **Zenith** (Labs Zenith) para estandarizar todos los productos de la suite. Este documento es autocontenido: reproduce los tokens, la tipografía y los componentes tal como están **implementados** en el producto de referencia (Panel de negocio), para poder recrearlos 1:1 en **Figma** (variables, text styles, componentes).
>
> **Fuente de verdad del código:** `app/globals.css` (Tailwind v4, CSS-first) y `app/layout.tsx` (fuentes). Si hay diferencia entre este doc y el código, gana `app/globals.css`.
>
> **Nota:** el tema por defecto es **oscuro forzado** (pantalla). La paleta **clara** existe para impresión/comprobantes. En Figma → crear una colección de variables de color con **dos modos: `Dark` y `Light`**.

---

## 1. Principios

1. **Tema oscuro por defecto.** La UI vive en oscuro; la paleta clara es para impresión. En Figma, modo `Dark` = valor por defecto.
2. **Verde de marca reservado, no de acción.** El verde spring `#00FF7F` (`brand`) **no** es el color de los botones primarios. Se reserva para: foco, estado activo, éxito y cifras positivas. Los botones primarios son **neutros** (casi blanco sobre casi negro).
3. **Color = atención.** Solo se colorea lo que tiene significado (éxito / advertencia / info / error). Los estados de identidad booleanos que no son "de atención" se mantienen **neutros** (`outline`).
4. **Profundidad por hairlines, no por sombras.** Bordes de 1px + contraste de superficie. Evitar drop shadows.
5. **Tokens semánticos siempre.** Nunca hex crudo ni tamaños de fuente sueltos: usar los tokens/estilos de este sistema.

---

## 2. Color

Cada color es un **token** con dos valores (modo Dark / modo Light). En código son variables CSS + utilidades Tailwind (`bg-*`, `text-*`, `border-*`) y admiten opacidad (`bg-success/15`). En Figma: una **variable de color por token**, con los dos modos.

> Los neutros de superficie usan `oklch` en el código (fuente de verdad); abajo va el **hex aproximado** para Figma. Los colores de marca/semánticos ya están en hex.

### 2.1 Neutros / superficies

| Token | Dark (oklch → hex aprox.) | Light (hex) | Utilidad | Uso |
|---|---|---|---|---|
| `background` | `oklch(0.145 0 0)` ≈ `#0A0A0A` | `#FAFAFA` | `bg-background` | Fondo de la app |
| `foreground` | `oklch(0.985 0 0)` ≈ `#FAFAFA` | `#171717` | `text-foreground` | Texto principal |
| `card` | `oklch(0.205 0 0)` ≈ `#1A1A1A` | `#FFFFFF` | `bg-card` | Superficie de tarjeta |
| `card-foreground` | ≈ `#FAFAFA` | `#171717` | `text-card-foreground` | Texto en tarjeta |
| `popover` | `oklch(0.205 0 0)` ≈ `#1A1A1A` | `#FFFFFF` | `bg-popover` | Menús/popovers |
| `popover-foreground` | ≈ `#FAFAFA` | `#171717` | — | Texto en popover |
| `primary` | `oklch(0.922 0 0)` ≈ `#E5E5E5` | `#171717` | `bg-primary` | **Botón primario (neutro)** |
| `primary-foreground` | `oklch(0.205 0 0)` ≈ `#1A1A1A` | `#FFFFFF` | `text-primary-foreground` | Texto sobre primario |
| `secondary` | `oklch(0.269 0 0)` ≈ `#262626` | `#F5F5F5` | `bg-secondary` | Superficie suave |
| `secondary-foreground` | ≈ `#FAFAFA` | `#171717` | — | Texto sobre secondary |
| `muted` | `oklch(0.269 0 0)` ≈ `#262626` | `#F5F5F5` | `bg-muted` | Superficie muted / hover |
| `muted-foreground` | `oklch(0.708 0 0)` ≈ `#A1A1A1` | `#666666` | `text-muted-foreground` | Texto secundario |
| `accent` | `oklch(0.269 0 0)` ≈ `#262626` | `#F5F5F5` | `bg-accent` | Hover neutro |
| `accent-foreground` | ≈ `#FAFAFA` | `#171717` | — | Texto en accent |
| `border` | `oklch(1 0 0 / 10%)` = `rgba(255,255,255,.10)` | `#EBEBEB` | `border-border` | Hairline 1px |
| `input` | `oklch(1 0 0 / 15%)` = `rgba(255,255,255,.15)` | `#EBEBEB` | — | Borde de inputs |
| `ring` | `#00FF7F` | `#A1A1A1` | `ring-ring` | **Anillo de foco (verde en dark)** |

### 2.2 Marca y semánticos

| Token | Dark (hex) | Light/impresión (hex) | Foreground (Dark / Light) | Significado |
|---|---|---|---|---|
| `brand` | `#00FF7F` | `#05966B` | `#05130C` / `#FFFFFF` | Acento de marca (verde spring) — **reservado** |
| `success` | `#00FF7F` | `#05966B` | `#05130C` / `#FFFFFF` | Éxito, pagado, activo, positivo |
| `warning` | `#F5A623` | `#B45309` | `#181717` / `#FFFFFF` | Advertencia, pendiente, stock bajo |
| `info` | `#5A8DFF` | `#0047AB` | `#05122E` / `#FFFFFF` | Info, enlaces, parcial (cobalto) |
| `destructive` | `oklch(0.704 0.191 22.216)` ≈ `#E5484D` | `#EE0000` | — | Error, vencido, salida |

> En Light/impresión, el verde y el ámbar se **oscurecen** para legibilidad sobre blanco; en Dark el cobalto se **aclara** (`#5A8DFF`). El cobalto de marca `#0047AB` se usa en rellenos e impresión.

### 2.3 Sidebar (tokens propios)

| Token | Dark | Light |
|---|---|---|
| `sidebar` | `oklch(0.205 0 0)` ≈ `#1A1A1A` | `#FFFFFF` |
| `sidebar-foreground` | `#FAFAFA` | `#171717` |
| `sidebar-primary` | `#00FF7F` | `#171717` |
| `sidebar-primary-foreground` | `#05130C` | `#FFFFFF` |
| `sidebar-accent` (fila activa) | `oklch(0.269 0 0)` ≈ `#262626` | `#F5F5F5` |
| `sidebar-accent-foreground` | `#FAFAFA` | `#171717` |
| `sidebar-border` | `rgba(255,255,255,.10)` | `#EBEBEB` |
| `sidebar-ring` | `#00FF7F` | `#A1A1A1` |

### 2.4 Charts (solo gráficas — NO usar como estado)

`chart-1` `#50E3C2` (teal) · `chart-2` `#0070F3` (azul) · `chart-3` `#7928CA` (morado) · `chart-4` `#FF0080` (rosa) · `chart-5` `#F5A623` (naranja). Exclusivos de series de datos.

---

## 3. Tipografía

**Fuentes** (cargadas en `app/layout.tsx` con `next/font/google`):

| Rol | Familia | Variable | Utilidad |
|---|---|---|---|
| Display / titulares | **Inter** | `--font-display` | `font-heading`, `font-display` |
| Texto (sans, default) | **Inter** | `--font-sans` | `font-sans` |
| Monoespaciada | **Geist Mono** | `--font-mono` | `font-mono` |

### 3.1 Escala tipográfica (estilo Linear)

Cada token = **un text style en Figma** (tamaño + interlineado + tracking + peso, todo junto). Familia = Inter salvo `text-mono` (Geist Mono).

| Estilo (`text-*`) | Tamaño | Interlineado | Tracking | Peso | Uso |
|---|---|---|---|---|---|
| `display-xl` | 80px | 1.05 (84px) | −3px | 600 | Hero / cifras enormes |
| `display-lg` | 56px | 1.10 (62px) | −1.8px | 600 | Display grande |
| `display-md` | 40px | 1.15 (46px) | −1px | 600 | Display medio |
| `headline` | 28px | 1.20 (34px) | −0.6px | 600 | **Título de página (`h1`)** |
| `card-title` | 22px | 1.25 (28px) | −0.4px | 500 | Títulos de tarjeta/sección |
| `subhead` | 20px | 1.40 (28px) | −0.2px | 400 | Subtítulos |
| `body-lg` | 18px | 1.50 (27px) | −0.1px | 400 | Cuerpo grande |
| `body` | 16px | 1.50 (24px) | −0.05px | 400 | Cuerpo base |
| `body-sm` | 14px | 1.50 (21px) | 0 | 400 | Cuerpo pequeño / tablas |
| `caption` | 12px | 1.40 (17px) | 0 | 400 | Leyendas |
| `button` | 14px | 1.20 (17px) | 0 | 500 | Etiqueta de botón |
| `eyebrow` | 13px | 1.30 (17px) | 0.4px | 500 | Antetítulos / labels |
| `mono` | 13px | 1.50 (20px) | 0 | 400 | Datos monoespaciados (Geist Mono) |

En Figma: crear los 13 como **Text Styles** nombrados `Text/display-xl`, `Text/headline`, etc.

---

## 4. Radios

Base `--radius = 8px (0.5rem)`. Escala derivada:

| Nombre | Cálculo | px |
|---|---|---|
| `rounded-sm` | ×0.6 | 4.8px |
| `rounded-md` | ×0.8 | 6.4px |
| `rounded-lg` | ×1 | **8px** (base) |
| `rounded-xl` | ×1.4 | 11.2px |
| `rounded-2xl` | ×1.8 | 14.4px |
| `rounded-3xl` | ×2.2 | 17.6px |
| `rounded-4xl` | ×2.6 | 20.8px (píldoras/badges) |

En Figma: variables numéricas `radius/sm … radius/4xl`.

---

## 5. Espaciado

Base **4px** (escala Tailwind: 1=4px, 2=8px, 3=12px, 4=16px, 6=24px, 8=32px…). Gaps más usados en la UI: `gap-1` (4), `gap-1.5` (6), `gap-2` (8), `gap-4` (16). Padding de página: `p-4` (16) móvil / `p-6` (24) desktop (ver `PageShell`). En Figma: usar auto-layout con estos valores.

---

## 6. Elevación y bordes

- **Sin sombras** para profundidad. Se usa **borde 1px** (`border-border`) + cambio de superficie (`card` sobre `background`).
- Foco: **anillo** de 3px (`ring-3 ring-ring/50`) + borde `ring`. En Dark el ring es verde `#00FF7F`.
- Estado inválido: borde + anillo `destructive`.

---

## 7. Iconografía

- Librería: **lucide-react**. Tamaño por defecto en botones/inputs: **16px** (`size-4`); en botones `sm`/`xs`: 14/12px.
- Trazo consistente (el de lucide). En Figma: importar el set de lucide como componentes.

---

## 8. Componentes

Specs derivadas del código (`components/ui/*`). En Figma: cada uno = un componente con variantes (properties).

### 8.1 Button — `components/ui/button.tsx`
Base: `inline-flex items-center justify-center rounded-lg text-sm font-medium`, transición, foco con anillo, `disabled:opacity-50`, micro-press (`active:translate-y-px`). Ícono como primer/último hijo (auto `size-4`).

**Variantes (color):**
| Variante | Aspecto |
|---|---|
| `default` | `bg-primary text-primary-foreground`, hover `primary/80` — **neutro, es el primario** |
| `outline` | borde `border`, fondo `background` (dark: `input/30`), hover `muted` |
| `secondary` | `bg-secondary`, hover ligeramente más claro |
| `ghost` | sin fondo, hover `muted` |
| `destructive` | `bg-destructive/10 text-destructive`, hover `/20` |
| `link` | texto `primary`, subrayado en hover |

**Tamaños:**
| Size | Alto | Padding | Texto | Ícono |
|---|---|---|---|---|
| `xs` | 24px (`h-6`) | `px-2` | `text-xs` | 12px |
| `sm` | 28px (`h-7`) | `px-2.5` | 12.8px | 14px |
| `default` | 32px (`h-8`) | `px-2.5` | `text-sm` | 16px |
| `lg` | 36px (`h-9`) | `px-2.5` | `text-sm` | 16px |
| `icon` | 32×32 | — | — | 16px |
| `icon-xs` / `icon-sm` / `icon-lg` | 24 / 28 / 36 cuadrado | — | — | 12 / 16 / 16px |

### 8.2 Input — `components/ui/input.tsx`
`h-8` (32px), `w-full`, `rounded-lg`, `border border-input`, fondo transparente (dark: `input/30`), `px-2.5 py-1`, texto `text-sm`, placeholder `muted-foreground`. Foco: borde `ring` + `ring-3 ring-ring/50`. Inválido: `destructive`. Va con **`Label`** (`text-sm`) arriba, `gap-1.5`.

### 8.3 Card — `components/ui/card.tsx`
`rounded-lg border border-border bg-card`, padding interno consistente (`--card-spacing`). Sub-piezas: `CardHeader` (con separador opcional `border-b`), `CardTitle` (`font-heading`), `CardDescription` (`text-sm text-muted-foreground`), `CardContent`, `CardFooter`, y **`CardRow`** — fila con borde sutil que muestra `label` mutado + `value` (para detalle/settings estilo Vercel).

### 8.4 Badge — `components/ui/badge.tsx`
Píldora `rounded-4xl`, `h-5` (20px), `text-xs`, `font-medium`. Variantes:
| Variante | Aspecto | Uso |
|---|---|---|
| `default` / `secondary` | relleno neutro | genérico |
| `outline` | solo borde | **booleano "off" (Inactivo)** |
| `ghost` / `link` | sin fondo | inline |
| `success` | tinte verde suave | Pagado, Activo, Entrada |
| `warning` | tinte ámbar | Pendiente, Stock bajo |
| `info` | tinte cobalto | Parcial, informativo |
| `destructive` | tinte rojo | Vencido, Salida, error |

Patrón semántico: `border-{c}/30 bg-{c}/15 text-{c}` (dark: `/40` y `/20`).

### 8.5 Select — `components/ui/select.tsx`
Reemplazo de `<select>` nativo (base-ui). Trigger con estilo de input (borde `input`, `rounded-lg`, chevron), popup en `popover` con ítems que resaltan en `accent`. Usar para **pickers de formulario** (no para menús de acción).

### 8.6 Dropdown Menu — `components/ui/dropdown-menu.tsx`
Menú de **acciones** (no de valor): trigger + popup `popover`, ítems con hover `accent`. Usado en el menú ⋯ de usuario y en export.

### 8.7 Dialog / Sheet — `components/ui/{dialog,sheet}.tsx`
Modal centrado (`Dialog`) y panel lateral (`Sheet`, drawer móvil). Fondo `popover`, backdrop translúcido con blur, `Title` en `font-heading`. Los formularios de crear/editar viven en `Dialog`.

### 8.8 Tabla — `components/ui/table.tsx`
Estilo Vercel: filas con separador sutil `border-b border-border`, hover `bg-muted/50`, headers `text-muted-foreground` peso normal, padding cómodo, **sin** bordes externos pesados. Números/códigos en `font-mono`.

### 8.9 Otros primitivos
- **Avatar** — círculo con inicial (`AvatarFallback`), fondo `sidebar-primary` para negocios.
- **Tabs** — `TabsList`/`TabsTab`/`TabsPanel` (con `keepMounted`).
- **Separator** — hairline `border-border`.
- **StatCard** (`components/domain/stat-card.tsx`) — tarjeta KPI: `label` mutado + `value` prominente.
- **PageShell / PageHeader** (`components/ui/page-shell`, `components/domain/page-header`) — contenedor centrado mobile-first (`mx-auto max-w-6xl`) + cabecera (`h1.text-headline` + descripción + acciones + breadcrumb).
- **MoneyAmount** (`components/domain/money-amount.tsx`) — `font-mono tabular-nums`; deltas `text-success` / `text-destructive`.

---

## 9. Patrones

### 9.1 Estados por dominio (convención de badges)
| Dominio | Estado | Variante |
|---|---|---|
| Facturas | pagada / pendiente / parcial / vencida | `success` / `warning` / `info` / `destructive` |
| Clientes · Nómina · Inventario | Activo / Inactivo | `success` / `outline` (inactivo = neutro, no error) |
| Inventario | Entrada / Salida | `success` / `outline` |
| Inventario | Stock bajo (1–3 uds) | `warning` |
| Pagos (método) · Egresos (categoría) | — | texto plano, sin badge |

### 9.2 Navegación (sidebar)
- Fila activa: `bg-sidebar-accent text-sidebar-accent-foreground` **+ ícono en verde** (`[&>svg]:text-brand`).
- Ítem: `rounded-md px-3 py-2 text-sm font-medium`; inactivo `text-sidebar-foreground/70`.
- Switcher de cuenta/negocio arriba; menú de usuario (⋯ Cerrar sesión) abajo.

### 9.3 Formularios (validación en vivo)
- Validación **mientras se escribe** contra los schemas Zod; error inline por campo (`text-xs text-destructive`) al salir del campo (`onBlur`); submit **deshabilitado hasta ser válido**. Mensajes en **español** (locale global de Zod).

### 9.4 Tarjeta de login (referencia)
Card `max-w-sm` centrada en `min-h-dvh`, cabecera centrada con marca (ícono en cajita `rounded-lg bg-sidebar-primary` + nombre), título (`CardTitle`) + subtítulo, campos con label, contraseña con toggle ojo, botón `w-full`.

---

## 10. Do / Don't

**Do**
- Reserva el verde (`brand`/`success`) para foco, activo, éxito y positivos.
- Usa los text styles de la escala (no combines tamaño+peso a mano).
- Colorea solo estados de atención; deja los booleanos de identidad en `outline`.
- Profundidad con hairlines (`border-border`), no sombras.
- Tokens semánticos con opacidad (`bg-warning/15`), nunca hex crudo.

**Don't**
- No hagas verde el color de todos los botones primarios (perdería el acento).
- No uses `chart-*` como color de estado.
- No agregues drop shadows para profundidad.
- No mezcles `Select` (valor de formulario) con `DropdownMenu` (acciones): son distintos.

---

## 11. Cómo montarlo en Figma

1. **Variables de color** → una colección `Color` con **dos modos: `Dark` (default) y `Light`**. Una variable por token de las secciones 2.1–2.4 (usa los hex de la columna correspondiente; los neutros oklch → el hex aproximado). Nómbralas igual que el token (`background`, `card`, `brand`, `success`, `sidebar-accent`, `chart-1`…).
2. **Text styles** → los 13 de la sección 3.1 (`Text/headline`, `Text/body`, …), familia Inter (y Geist Mono para `mono`), con su tamaño/interlineado/tracking/peso.
3. **Variables de número** → radios (sección 4) y espaciado (sección 5) como variables, para auto-layout.
4. **Componentes** → crea cada uno de la sección 8 como componente con *properties* para sus variantes (Button: variant + size; Badge: variant; etc.), enlazando fills/strokes/typography a las variables/estilos de arriba.
5. **Efecto de foco** → estilo de efecto o borde: anillo 3px al 50% del color `ring` (verde en Dark).
6. **Regla de oro**: cero valores crudos en Figma — todo apunta a variables/estilos, igual que en el código todo apunta a tokens.

---

## 12. Fuente de verdad (código)

| Archivo | Qué define |
|---|---|
| `app/globals.css` | **Todos los tokens**: `@theme inline` (colores, fuentes, escala tipográfica, radios), `.dark` (pantalla), `:root`/`.light` (impresión). Canónico. |
| `app/layout.tsx` | Carga de fuentes (Inter + Geist Mono), `dark` forzado, `lang="es"`. |
| `DESIGN.md` (raíz) | Guía de uso resumida para desarrollo. |
| `components/ui/*` | Primitivos (button, input, card, badge, select, dialog, sheet, table, avatar, tabs, separator, page-shell). |
| `components/domain/*` | Compuestos (page-header, stat-card, money-amount, form dialogs). |
| `components/layout/*` | Navegación (nav-link, sidebar, switcher). |

> Al evolucionar el sistema: cambia primero `app/globals.css`, y **sincroniza este documento + las variables de Figma** para que los tres nunca diverjan.
