<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Design system

Before writing or changing any UI, read `DESIGN.md` (repo root) and follow it: use its typography-scale utilities (`text-headline`, `text-card-title`, …), semantic color tokens (`bg-primary`, `text-success`, `bg-warning/15`, …) and Badge variants. Never hardcode hex colors or ad-hoc font sizes. The canonical tokens live in `app/globals.css`.
