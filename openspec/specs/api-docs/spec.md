# API Docs Specification

## Purpose

Publish the OpenAPI contract and an interactive reference UI for the implemented API surface, using Scalar API Reference in place of Swagger UI to avoid a React 19 peer-dependency conflict.

## Requirements

### Requirement: OpenAPI Specification Endpoint

`GET /api/openapi.json` MUST return an OpenAPI 3 document describing all implemented endpoints (auth, customers, invoices, payments, dashboard). It MUST NOT include secrets, API keys, tokens, or real environment variable values.

#### Scenario: Fetch OpenAPI document

- GIVEN an authenticated session (or dev-mode access, see session requirement below)
- WHEN `GET /api/openapi.json` is called
- THEN the response is a valid OpenAPI 3 JSON document with no secret values present

### Requirement: Interactive Docs UI via Scalar

`GET /api/docs` MUST render an interactive API reference using Scalar API Reference, pointing at `/api/openapi.json` as its source. This substitutes Swagger UI for this MVP scaffold; the substitution MUST be documented in `docs/technical-architecture.md`.

#### Scenario: Open docs UI

- GIVEN an authenticated session (or dev-mode access)
- WHEN the user navigates to `/api/docs`
- THEN a Scalar-rendered interactive reference loads, sourced from `/api/openapi.json`

### Requirement: Session Requirement in Production-Beta

In a production-beta configuration, both `/api/docs` and `/api/openapi.json` SHOULD require an authenticated session, per the security checklist. In local/dev-only mock mode they MAY remain accessible without a session, but MUST NEVER expose secrets regardless of mode.

#### Scenario: Unauthenticated access blocked in production-beta

- GIVEN the app is configured for production-beta
- WHEN an unauthenticated request hits `/api/docs` or `/api/openapi.json`
- THEN the request is rejected pending a valid session

### Requirement: No-Store Caching for Gated Docs

When session-gated, docs endpoints MUST respond with `Cache-Control: no-store`, consistent with the private-endpoint convention used across the API.

#### Scenario: Cache header present when gated

- GIVEN docs endpoints are session-gated
- WHEN a request is served
- THEN the response includes `Cache-Control: no-store`
