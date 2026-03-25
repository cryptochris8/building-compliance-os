# ADR-003: Jurisdiction Laws as Configuration Data

## Status: Accepted

## Context
Different cities have different building emissions laws (NYC LL97, Boston BERDO, Chicago, DC BEPS). Each law has its own carbon coefficients, emissions limits by building type, penalty rates, and compliance periods.

## Decision
Jurisdiction rules are defined as `JurisdictionConfig` objects in `src/lib/jurisdictions/`. Each config contains:
- Carbon coefficients per fuel type per compliance period
- Emissions limits per occupancy type (tCO2e/sqft)
- Penalty rate per ton over limit
- Reporting deadlines and threshold building size

A registry maps jurisdiction IDs to configs. The calculator accepts a `jurisdictionId` parameter and looks up the appropriate coefficients and limits.

## Consequences
- Adding a new jurisdiction requires only a new config file and registry entry — no calculator code changes.
- Jurisdictions with different occupancy type taxonomies (e.g., Boston vs NYC) work naturally.
- Period-based rules (different limits for 2024-2029 vs 2030-2034) are first-class.
- If jurisdictions grow to dozens, consider moving configs to a database table.

## Alternatives Considered
- **Database-stored configs:** More flexible but adds migration complexity and loses type safety.
- **Hardcoded in calculator:** Simpler initially but doesn't scale to multiple jurisdictions.
