# ADR-002: Pure Calculation Engine Separated from Persistence

## Status: Accepted

## Context
Emissions calculations are the core business logic. They need to be testable, auditable, and deterministic.

## Decision
The calculation engine is split into two layers:
- `calculator.ts` — Pure functions with no database dependency. Accepts typed inputs, returns results. Fully unit-testable.
- `compliance-service.ts` — Orchestrator that reads from the database, calls the pure calculator, and persists results in a transaction.

## Consequences
- Calculator functions can be tested with simple unit tests (no mocking required).
- The same calculator can be used in the public marketing calculator page without DB access.
- Adding new jurisdictions only requires adding config data, not modifying calculation logic.
- The compliance service has more complex testing requirements (needs DB mocking).
