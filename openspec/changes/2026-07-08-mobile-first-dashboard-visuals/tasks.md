# Tasks: Mobile-First Dashboard Visuals

## Phase 1: SDD and Dependencies

- [x] 1.1 Create OpenSpec proposal/design/tasks/spec deltas for dashboard charts and responsive UI.
- [x] 1.2 Validate the OpenSpec change. Automated CLI unavailable in this repo/session (`npx openspec` has no executable; `@openspec/cli` not published). Performed structural validation against `openspec/config.yaml`: proposal/design/tasks present, deltas use RFC 2119 and Given/When/Then, business_id impact stated.
- [x] 1.3 Apply Vercel theme with `npx getdesign@latest add vercel`.
- [x] 1.4 Add `recharts`.

## Phase 2: Dashboard Charts

- [x] 2.1 RED: add tests for dashboard chart aggregate helpers, including business scoping.
- [x] 2.2 GREEN: implement chart aggregate helpers in `dashboard-service`.
- [x] 2.3 Add chart UI components using `recharts`.
- [x] 2.4 Integrate chart section into dashboard with skeleton/loading behavior.

## Phase 3: Mobile-First Responsive Pass

- [x] 3.1 Update dashboard headers/actions/grids for mobile-first layout.
- [x] 3.2 Update customers, invoices, and payments filters/actions to use mobile-first Tailwind widths/grids.
- [x] 3.3 Update detail pages and invoice creation form for mobile stacking and stable table widths.
- [x] 3.4 Update dialog content sizing/scrolling for small screens.
- [x] 3.5 Improve mobile dashboard navigation with larger touch targets, icons, and clearer active state.

## Phase 4: Verification

- [x] 4.1 Run `npm run lint`.
- [x] 4.2 Run `npm run typecheck`.
- [x] 4.3 Run `npm run test`.
- [x] 4.4 Run `npm run test:e2e`.
- [x] 4.5 Manually inspect desktop/mobile screenshots if a local server can run.
