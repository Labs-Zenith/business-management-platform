# Receipts Delta

## ADDED Requirements

### Requirement: Downloadable Invoice PDF

The system MUST provide a downloadable PDF for an invoice showing the same material information as the printable invoice comprobante: business data, customer data, invoice number, dates, current computed status, items, subtotal, total, paid amount, balance, and the mandatory DIAN notice.

#### Scenario: Download own-business invoice PDF

- GIVEN an invoice belonging to business B1
- WHEN a B1 session requests its PDF
- THEN the response is a PDF attachment
- AND the PDF is generated from B1-scoped invoice and business data

#### Scenario: Download another business's invoice denied

- GIVEN an invoice belonging to business B2
- WHEN a B1 session requests its PDF
- THEN access is denied as not found

### Requirement: Mandatory Legal Notice in Invoice PDF

The invoice PDF MUST display the notice: "Documento interno, no valido como factura electronica DIAN."

#### Scenario: Invoice PDF includes DIAN notice

- GIVEN any invoice PDF generated for an authenticated business
- WHEN the PDF is rendered
- THEN the DIAN legal notice is included in the document content
