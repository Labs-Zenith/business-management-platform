# Dashboard Delta

## ADDED Requirements

### Requirement: Legible Chart Tooltips

Dashboard chart tooltips MUST be legible in light and dark themes and MUST use user-facing Spanish labels instead of raw data keys.

#### Scenario: User hovers a chart bar

- GIVEN the dashboard charts are visible
- WHEN the user hovers a bar
- THEN the tooltip text contrasts against its background
- AND values are labeled with Spanish terms such as "Saldo", "Monto", or "Total"
