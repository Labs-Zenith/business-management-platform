# Delta for Receipts

## REMOVED Requirements

### Requirement: Mandatory Legal Notice

(Reason: Fase 2 plan item 1 — "El mensaje de factura de Dian quitarlo." The DIAN
non-fiscal notice is being removed outright from all printable comprobantes and
the invoice PDF export. This is a straight removal, not a substitution; no
replacement legal/compliance notice is introduced.)
(Migration: None. Replaced by the "No DIAN/Tax-Authority Notice" requirement
below, which asserts the notice's absence as a positive, testable behavior.)

## ADDED Requirements

### Requirement: No DIAN/Tax-Authority Notice

Printable comprobantes (invoice and payment receipts) and the invoice PDF
export MUST NOT display any DIAN or other tax-authority notice text, including
but not limited to the string "Documento interno, no valido como factura
electronica DIAN." No replacement legal or compliance notice is rendered in
its place.

#### Scenario: No DIAN notice on printable invoice receipt

- GIVEN a printable invoice receipt view
- WHEN it is rendered
- THEN no DIAN or tax-authority notice text is present on the page

#### Scenario: No DIAN notice on printable payment receipt

- GIVEN a printable payment receipt view
- WHEN it is rendered
- THEN no DIAN or tax-authority notice text is present on the page

#### Scenario: No DIAN notice in invoice PDF export

- GIVEN an invoice PDF export is generated
- WHEN the PDF content is inspected
- THEN no DIAN or tax-authority notice text is present anywhere in the document
