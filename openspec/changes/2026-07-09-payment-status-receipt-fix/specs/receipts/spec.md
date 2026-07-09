# Receipts Delta

## ADDED Requirements

### Requirement: Mock Payment Receipt Fallback

In the mocked MVP environment, a payment receipt page SHOULD render a safe mock comprobante instead of failing when the requested payment record is missing.

#### Scenario: Missing payment receipt in mock

- GIVEN an authenticated session
- WHEN the user opens a payment receipt URL whose payment id is absent from the mock store
- THEN the page renders a mock payment comprobante with placeholder customer/invoice data
- AND the mandatory DIAN notice remains visible
