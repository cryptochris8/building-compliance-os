# Database Schema

## Overview

PostgreSQL via Supabase with Drizzle ORM. Schema defined in `src/lib/db/schema/`.

## Entity Relationship

```
organizations ──< users
     │
     ├──< buildings ──< utility_accounts ──< utility_readings
     │        │
     │        ├──< compliance_years ──< deductions
     │        │         │
     │        │         └──< compliance_activities
     │        │
     │        └──< documents
     │
     ├──< import_jobs
     ├──< pm_connections
     ├──< pm_property_mappings
     └──< subscriptions
```

## Tables

### organizations
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | text | |
| stripe_customer_id | text | Nullable |
| subscription_tier | enum | free/pro/portfolio/enterprise |
| created_at | timestamptz | |

### users
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Matches Supabase auth.users.id |
| organization_id | UUID FK → organizations | SET NULL on delete |
| role | enum | owner/admin/member |
| full_name | text | |
| email | text | NOT NULL |

### buildings
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| organization_id | UUID FK → organizations | CASCADE, NOT NULL |
| name, address_line1, city, state, zip | text | NOT NULL |
| borough, bbl, bin | text | NYC-specific identifiers |
| gross_sqft | numeric | NOT NULL |
| occupancy_type | text | Matches jurisdiction limits keys |
| jurisdiction_id | text | Default 'nyc-ll97' |
| occupancy_mix | jsonb | OccupancyMixEntry[] for mixed-use |
| portfolio_manager_id | text | EPA PM property ID |

### utility_accounts
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| building_id | UUID FK → buildings | CASCADE |
| utility_type | enum | electricity/natural_gas/district_steam/fuel_oil_2/fuel_oil_4 |
| account_number | text | |
| is_tenant_paid | boolean | Default false |

### utility_readings
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| utility_account_id | UUID FK → utility_accounts | CASCADE |
| building_id | UUID FK → buildings | CASCADE |
| period_start, period_end | date | NOT NULL |
| consumption_value | numeric | NOT NULL |
| consumption_unit | text | kwh/therms/kbtu/gallons |
| cost_dollars | numeric | Nullable |
| source | enum | manual/csv_upload/portfolio_manager/green_button |
| confidence | enum | confirmed/estimated/flagged |

**Unique constraint:** `(utility_account_id, period_start, period_end)`
**Indexes:** `building_id`, `(building_id, period_start, period_end)`

### compliance_years
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| building_id | UUID FK → buildings | CASCADE |
| year | integer | NOT NULL |
| jurisdiction_id | text | |
| total_emissions_tco2e | numeric | Calculated |
| emissions_limit_tco2e | numeric | Calculated |
| emissions_over_limit | numeric | Calculated |
| estimated_penalty_dollars | numeric | Calculated |
| status | enum | incomplete/compliant/at_risk/over_limit |
| data_completeness_pct | numeric | |
| missing_months | jsonb | string[] |
| total_deductions_tco2e | numeric | Sum of deductions |
| net_emissions_tco2e | numeric | Gross - deductions |
| locked | boolean | Prevents modifications when true |
| checklist_state | jsonb | Record<string, boolean/string> |
| report_submitted | boolean | |

**Unique constraint:** `(building_id, year)`

### deductions
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| building_id | UUID FK → buildings | CASCADE |
| compliance_year_id | UUID FK → compliance_years | CASCADE |
| deduction_type | enum | purchased_recs/onsite_renewables/community_dg/other |
| amount_tco2e | numeric | NOT NULL |
| verified | boolean | Default false |

### documents
Evidence vault for compliance documentation (utility bills, reports, etc).

### import_jobs
Tracks CSV import progress (pending → processing → completed/failed).

### pm_connections / pm_property_mappings
EPA Portfolio Manager integration credentials and property linkages.

### subscriptions
Stripe subscription records synced via webhooks.

## Row Level Security

All tables have RLS enabled. Policies scope data to the authenticated user's organization via `get_user_org_id()` function. Service role bypasses RLS for server-side operations.

## Connection

Drizzle ORM with `postgres` driver. Lazy-initialized singleton with connection pooling (`max: 10`, `idle_timeout: 20s`).
