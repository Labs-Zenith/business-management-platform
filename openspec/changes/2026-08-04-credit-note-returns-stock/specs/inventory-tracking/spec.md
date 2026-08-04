# Inventory Tracking Delta

## ADDED Requirements

### Requirement: Movement Direction Follows the Invoice Type

The system MUST decide a product line's inventory movement direction from the invoice type's catalog `code`: `nota_credito` MUST emit an `in` movement (a return puts units back), and every other type MUST emit `out`. An unrecognised, null or missing code MUST default to `out`.

#### Scenario: A credit note returns the units to stock

- GIVEN a product with 10 units, of which 2 were sold (8 remaining)
- WHEN a credit note is created for 2 units of that product
- THEN the product's computed quantity becomes 10
- AND the recorded movement's type is `in`

#### Scenario: A debit note still consumes stock

- GIVEN a product with stock on hand
- WHEN a debit note is created for one of its units
- THEN the movement is a guarded `out`, exactly like a sale

### Requirement: The Floor-at-Zero Guard Is Direction-Specific

The atomic floor-at-zero guard MUST apply only to `out` movements. An `in` cannot drive the computed quantity below zero and MUST NOT be guarded or refused.

#### Scenario: A return is accepted with zero stock on hand

- GIVEN a product whose computed quantity is 0
- WHEN a credit note for 4 units of it is created
- THEN it succeeds and the computed quantity becomes 4
- WHEREAS a sale of 1 unit in the same state is refused with `VALIDATION_ERROR`

### Requirement: Editing Reverses and Re-applies in the Type's Direction

Editing an invoice MUST reverse every OLD product line and re-apply every NEW one, with both directions mirrored per the invoice type. The side that emits `out` MUST carry the floor-at-zero guard, and a failure MUST roll back the whole edit.

#### Scenario: Correcting the quantity on a credit note

- GIVEN a product with 10 units and a credit note returning 3 (13 on hand)
- WHEN the note is edited down to 1 unit
- THEN the computed quantity becomes 11

#### Scenario: Reversing a return whose units were already re-sold

- GIVEN a credit note that returned 2 units which have since been sold again (0 on hand)
- WHEN that credit note is edited
- THEN the edit is refused with `VALIDATION_ERROR` naming the missing units
- AND the computed quantity is unchanged

## MODIFIED Requirements

### Requirement: Out-of-Stock Products Cannot Be Picked When Creating an Invoice

Previously stated for invoice creation in general. It MUST now apply only when creating an invoice whose type consumes stock (a SALE). On a credit note the affordance MUST be off entirely: a return adds units, so it can never over-draw, and an out-of-stock product is precisely the one being returned — disabling it would make the common case impossible to record.

#### Scenario: An out-of-stock product is selectable on a credit note

- GIVEN a product whose computed quantity is 0
- WHEN the invoice type is set to "Nota crédito"
- THEN that product is listed with its real quantity and is selectable
- AND no over-draw warning is shown for any quantity entered

#### Scenario: The same product stays blocked on a sale

- GIVEN the same product at 0
- WHEN the invoice type is a sale
- THEN it is labelled "sin stock" and cannot be selected
