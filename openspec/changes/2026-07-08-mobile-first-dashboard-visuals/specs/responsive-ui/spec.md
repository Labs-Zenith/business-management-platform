# Responsive UI Delta

## ADDED Requirements

### Requirement: Mobile-First Operational Screens

Dashboard, customers, invoices, payments, settings, customer detail, invoice detail, and invoice creation screens MUST use mobile-first Tailwind layout classes so primary actions, filters, forms, and content remain usable on narrow viewports.

#### Scenario: User opens operational screens on a phone

- GIVEN an authenticated mobile user
- WHEN the user navigates across operational dashboard screens
- THEN primary actions remain visible and tappable
- AND filters/forms stack vertically before expanding at larger breakpoints
- AND content does not require page-level horizontal scrolling except inside table containers

### Requirement: Viewport-Safe Dialogs

Customer and payment dialogs MUST fit within the viewport on small screens and MUST allow internal scrolling when their content is taller than the available height.

#### Scenario: User opens a form dialog on a short phone viewport

- GIVEN an authenticated mobile user
- WHEN the user opens a customer or payment dialog
- THEN the dialog remains within the viewport
- AND the form content can be scrolled without losing access to the submit action

### Requirement: Touch-Friendly Mobile Navigation

The mobile dashboard navigation MUST provide touch-friendly targets, recognizable section indicators, and a clear active state so users can move between Dashboard, Clientes, Facturas, Pagos, and Negocio without relying on tiny text links.

#### Scenario: User switches sections from a phone

- GIVEN an authenticated mobile user
- WHEN the user views the dashboard navigation
- THEN each primary section target is large enough to tap comfortably
- AND each target includes a recognizable visual indicator plus label
- AND the current section has a clear active state
