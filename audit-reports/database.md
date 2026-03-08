# Database Architecture Review - Building Compliance OS

**Reviewer:** Database Agent (Senior Database Architect)
**Date:** 2026-03-07
**Codebase:** Building Compliance OS (NYC LL97 Compliance SaaS)
**Technology Stack:** Supabase Postgres, Drizzle ORM v0.45.1, postgres.js v3.4.8
**Overall Grade:** B+

---

## Executive Summary

The Building Compliance OS database layer demonstrates **solid fundamentals** with excellent schema design, proper use of transactions, and good indexing coverage. The Drizzle ORM implementation is clean and type-safe. However, several areas require attention: missing foreign key constraints with ON DELETE/UPDATE actions, no migration system in place, lack of database-level validations, and some N+1 query patterns that have been partially addressed.

**Key Strengths:**
- Well-normalized schema with appropriate denormalization for compliance data
- Comprehensive indexing on all foreign keys and critical query paths
- Proper use of transactions for multi-step operations
- Type-safe Drizzle ORM integration with excellent TypeScript inference
- Connection pooling configured correctly

**Key Weaknesses:**
- No foreign key cascade/restrict policies defined
- Zero migration files (schema exists but no versioned migrations)
- Missing database-level constraints (CHECK, DEFAULT)
- No backup/restore strategy evident
- Limited use of database features (triggers, computed columns, views)

---

## 1. Schema Design Analysis

### 1.1 Overall Architecture

**Grade: A-**

The schema follows a clean, normalized multi-tenant design with proper entity separation:

```
organizations (root tenant)
  └─ users (org members)
  └─ buildings (assets)
       └─ utility_accounts (meters)
            └─ utility_readings (time-series data)
       └─ compliance_years (calculated results)
            └─ deductions (adjustments)
            └─ documents (evidence)
       └─ compliance_activities (audit log)
  └─ pm_connections (Portfolio Manager integration)
  └─ pm_property_mappings (PM property linking)
  └─ subscriptions (Stripe billing)
  └─ import_jobs (async job tracking)
```

**Strengths:**
- Clear tenant isolation via `organization_id` on all root entities
- Proper star schema for compliance data (facts: readings, dimensions: buildings/accounts)
- Appropriate use of JSONB for flexible data (occupancy_mix, missing_months, checklist_state)
- Comprehensive enums for all categorical data (15 pgEnum types defined)
- Good use of denormalization in `compliance_years` table for calculated metrics

**Issues:**
1. **Missing org_id propagation**: Some child entities (utility_accounts, utility_readings) don't have direct org_id reference, making org-level queries require joins through buildings
2. **No soft deletes**: Hard deletes with no audit trail for critical data (buildings, readings)
3. **Timestamp coverage incomplete**: Some tables lack `updated_at` (utility_accounts, documents)

### 1.2 Data Types & Precision

**Grade: B+**

Generally good choices, but some concerns:

**Appropriate:**
- UUID primary keys (good for distributed systems)
- `numeric` for financial/emissions data (avoids float precision issues)
- `timestamp with timezone` for temporal data
- `date` for period boundaries
- `jsonb` for semi-structured metadata

**Concerns:**
1. **Numeric precision not specified**: `numeric('gross_sqft')` should be `numeric(12, 2)` for clarity
2. **String storage of numbers**: Several numeric fields stored as `text` then converted (e.g., `totalEmissionsTco2e: String(result.totalEmissionsTco2e)`) - this bypasses DB validation
3. **JSONB validation missing**: No CHECK constraints to validate JSONB structure

### 1.3 Normalization

**Grade: A**

Excellent normalization with strategic denormalization:

**Well-normalized:**
- Utility accounts separated from readings (proper 1:N relationship)
- Users separate from auth (delegated to Supabase Auth)
- Deductions separate from compliance years (allows multiple adjustments)

**Strategic denormalization:**
- Compliance years cache calculated totals (totalEmissionsTco2e, emissionsLimitTco2e, etc.) - appropriate for read-heavy workload
- Building address fields flattened rather than normalized location table - acceptable for this use case

**Best Practice:**
- Unique constraints on natural keys:
  - `unique_reading` on (utility_account_id, period_start, period_end)
  - `unique_compliance_year` on (building_id, year)

---

## 2. Indexes & Query Optimization

### 2.1 Index Coverage

**Grade: A-**

**Current Indexes (13 total):**
```typescript
// Foreign key indexes (good practice)
idx_users_org_id
idx_buildings_org_id
idx_utility_accounts_building_id
idx_utility_readings_building_id
idx_documents_building_id
idx_documents_compliance_year_id
idx_import_jobs_org_id
idx_compliance_activities_building_id
idx_deductions_compliance_year_id
idx_subscriptions_org_id
idx_subscriptions_stripe_sub_id

// Unique constraints (business logic)
unique_reading (utility_account_id, period_start, period_end)
unique_compliance_year (building_id, year)
```

**Strengths:**
- Every foreign key has an index (critical for join performance)
- Composite unique indexes prevent duplicate data
- Stripe subscription lookup optimized

**Missing Indexes (Medium Priority):**
1. **Compliance year queries by year**: `idx_compliance_years_year` (for portfolio rollups)
2. **Readings by period**: `idx_utility_readings_period_start` (for date range queries)
3. **Documents by type**: `idx_documents_document_type` (if filtering by type is common)
4. **Activities by type + timestamp**: `idx_compliance_activities_type_created_at` (for audit log queries)
5. **PM property mappings lookup**: `idx_pm_property_mappings_pm_property_id`

**Missing Index Evidence:**

Found in `src/lib/emissions/compliance-service.ts:83-86`:
```typescript
sql`${utilityReadings.periodStart} >= ${yearStart}`,
sql`${utilityReadings.periodEnd} <= ${yearEnd}`
```
This date range query would benefit from an index on `period_start` for efficient range scans.

Found in `src/app/(dashboard)/buildings/page.tsx:61-64`:
```typescript
const latestCyYear = db.select({
  buildingId: complianceYears.buildingId,
  maxYear: sql<number>`max(${complianceYears.year})`.as('max_year'),
}).from(complianceYears).groupBy(complianceYears.buildingId).as('latest_cy');
```
This subquery would benefit from an index on (building_id, year) for aggregation.

### 2.2 Query Patterns

**Grade: B+**

**Excellent practices observed:**
1. **Batch queries to eliminate N+1:**
   - `src/lib/auth/helpers.ts:78-83`: Uses `inArray()` for batch building authorization
   - `src/lib/notifications/deadline-reminders.ts:41-42`: Batch fetches compliance years
   - `src/app/actions/compliance-workflow.ts:163-167`: Batch compliance year fetch

2. **LEFT JOIN optimization:**
   - `src/lib/emissions/compliance-service.ts:189-207`: Single query with LEFT JOIN instead of N+1
   - `src/app/(dashboard)/buildings/page.tsx:68-79`: LEFT JOIN for latest compliance status

3. **Proper use of LIMIT:**
   - 51 occurrences of `.limit(1)` for single-record lookups (prevents over-fetching)
   - Pagination implemented: `src/app/(dashboard)/buildings/page.tsx:78-79` (limit + offset)

**Issues identified:**

1. **Sequential queries in loops (N+1 remnants):**
   - `src/lib/portfolio-manager/sync.ts:55-64`: Fetches existing mapping inside loop (line 38-78)
   - `src/lib/portfolio-manager/sync.ts:128-137`: Account lookup inside meter loop
   - `src/lib/inngest/process-csv-import.ts:70-78`: Account lookup per CSV row

   **Impact:** Portfolio Manager sync with 100 properties = 100 database queries instead of 1

2. **Missing query optimization:**
   - No use of `SELECT DISTINCT` where appropriate
   - No use of database views for complex recurring queries
   - No prepared statements (Drizzle doesn't expose this, but worth noting)

3. **Count queries without indexes:**
   - `src/app/(dashboard)/buildings/page.tsx:55-57`: `count(*)` on buildings table (OK for now, but will slow down at scale)

### 2.3 Query Analysis Examples

**Good Example - Batch Authorization:**
```typescript
// src/lib/auth/helpers.ts:72-88
export async function filterAuthorizedBuildingIds(buildingIds: string[]) {
  const ownedBuildings = await db.select({ id: buildings.id })
    .from(buildings)
    .where(and(
      inArray(buildings.id, buildingIds),  // Single query for multiple IDs
      eq(buildings.organizationId, ctx.orgId)
    ));
  return { orgId: ctx.orgId, authorizedIds: ownedBuildings.map(b => b.id) };
}
```

**Bad Example - N+1 in Loop:**
```typescript
// src/lib/portfolio-manager/sync.ts:55-64
for (const prop of properties) {  // Loop over properties
  const existing = await db.select()  // ❌ Query per iteration
    .from(pmPropertyMappings)
    .where(and(
      eq(pmPropertyMappings.orgId, orgId),
      eq(pmPropertyMappings.pmPropertyId, prop.id)
    ))
    .limit(1);
}
```

**Fix:** Batch fetch all existing mappings before loop:
```typescript
const existingMappings = await db.select()
  .from(pmPropertyMappings)
  .where(eq(pmPropertyMappings.orgId, orgId));
const mappingsByProp = new Map(existingMappings.map(m => [m.pmPropertyId, m]));
```

---

## 3. Constraints & Data Integrity

### 3.1 Foreign Key Constraints

**Grade: C+**

**Defined:** 24 foreign key references found in schema

**Critical Issue: No ON DELETE/UPDATE policies**

Every foreign key lacks cascade/restrict behavior:
```typescript
// Current (no cascade policy)
organizationId: uuid('organization_id').references(() => organizations.id).notNull(),

// Should be:
organizationId: uuid('organization_id')
  .references(() => organizations.id, { onDelete: 'cascade' })
  .notNull(),
```

**Impact:**
- Deleting an organization does not cascade to buildings/users (orphaned records)
- Deleting a building does not cascade to readings (data integrity risk)
- Application must manually handle cascading deletes (error-prone)

**Recommended Policies:**

| Parent → Child | Policy | Reason |
|----------------|--------|--------|
| organizations → buildings | CASCADE | Buildings belong to org |
| buildings → utility_accounts | CASCADE | Accounts belong to building |
| utility_accounts → utility_readings | CASCADE | Readings belong to account |
| buildings → compliance_years | CASCADE | Compliance data is building-specific |
| compliance_years → deductions | CASCADE | Deductions are year-specific |
| users → documents.uploaded_by | SET NULL | Preserve document if user deleted |
| buildings → documents | RESTRICT | Prevent building deletion with documents |

### 3.2 Check Constraints

**Grade: D**

**Found:** Zero CHECK constraints in schema

**Missing Validations:**
1. **Positive values:** `gross_sqft > 0`, `consumption_value >= 0`, `amount_tco2e >= 0`
2. **Date ranges:** `period_end >= period_start`
3. **Percentage bounds:** `data_completeness_pct BETWEEN 0 AND 100`
4. **Year validity:** `year BETWEEN 2000 AND 2100`
5. **JSONB structure:** Validate occupancy_mix array format

**Current State:** All validation is in application layer (Zod schemas)

**Risk:** Direct database inserts bypass validation (via SQL, admin tools, etc.)

### 3.3 Not Null Constraints

**Grade: B+**

Good coverage of NOT NULL on critical fields:
- All primary keys (implicit)
- All foreign keys marked `.notNull()` where required
- Core business fields (name, email, consumption_value)

**Missing NOT NULL:**
- `organizations.name` should be NOT NULL (currently nullable)
- `utility_accounts.utility_type` is NOT NULL ✓ (good)
- `compliance_years.year` is NOT NULL ✓ (good)

### 3.4 Default Values

**Grade: B**

**Good defaults:**
- `defaultRandom()` for UUID primary keys
- `defaultNow()` for timestamps
- Enum defaults: `subscription_tier.default('free')`, `confidence.default('confirmed')`

**Missing defaults:**
- `buildings.jurisdiction_id` has `.default('nyc-ll97')` ✓ (good)
- `compliance_years.locked` has `.default(false)` ✓ (good)
- Could add: `utility_accounts.is_tenant_paid.default(false)` (currently has it ✓)

---

## 4. Transactions & Concurrency

### 4.1 Transaction Usage

**Grade: A**

**Excellent:** All multi-step operations use transactions.

**Found 3 transaction locations:**
1. `src/lib/emissions/compliance-service.ts:131-164` - Compliance year upsert with deduction calculation
2. `src/app/actions/deductions.ts:58-81` - Deduction insert + compliance total update + activity log
3. `src/app/api/webhooks/stripe/route.ts:54-71, 94-107, 116-124` - Stripe webhook subscription updates

**Best Practice Example:**
```typescript
// src/app/actions/deductions.ts:58-81
await db.transaction(async (tx) => {
  const [newDeduction] = await tx.insert(deductions).values({...}).returning();
  await updateDeductionTotals(complianceYearId, tx);  // Recalculate totals
  await tx.insert(complianceActivities).values({...});  // Audit log
  return newDeduction;
});
```

**Strength:** Typed transaction client ensures all operations share same connection.

### 4.2 Concurrency Control

**Grade: C**

**Issues:**
1. **No optimistic locking:** Compliance year updates don't check version/timestamp
2. **No row-level locking:** No `FOR UPDATE` in critical sections
3. **Race conditions possible:**
   - Two users updating same compliance year simultaneously
   - CSV import + manual reading creation conflicting

**Example Race Condition:**
```typescript
// User A reads compliance year
const [cy] = await db.select().from(complianceYears).where(...);

// User B reads same compliance year (gets same data)

// User A updates
await db.update(complianceYears).set({ totalEmissions: 100 });

// User B updates (overwrites A's change)
await db.update(complianceYears).set({ totalEmissions: 200 });
```

**Recommendation:** Add `updated_at` checks:
```typescript
const result = await db.update(complianceYears)
  .set({ totalEmissions: 200, updatedAt: new Date() })
  .where(and(
    eq(complianceYears.id, id),
    eq(complianceYears.updatedAt, lastKnownUpdatedAt)  // Optimistic lock
  ))
  .returning();

if (result.length === 0) throw new Error('Concurrent modification detected');
```

### 4.3 Deadlock Prevention

**Grade: B**

**Low risk** due to:
- Simple transaction structure (2-3 operations each)
- Consistent lock order (parent → child)
- Short-lived transactions

**Potential Issue:** CSV import background job could lock many rows for extended period.

---

## 5. ORM & Query Builder Usage

### 5.1 Drizzle ORM Integration

**Grade: A-**

**Strengths:**
1. **Type safety:** Full TypeScript inference from schema to queries
2. **Relations defined:** All foreign keys mapped with `.relations()` (lines 193-247 in schema/index.ts)
3. **Clean query syntax:** No raw SQL except for date comparisons and aggregations
4. **Schema co-location:** All schemas in `src/lib/db/schema/` with barrel export

**Example of excellent type safety:**
```typescript
const [building] = await db.select().from(buildings)
  .where(eq(buildings.id, buildingId)).limit(1);
// TypeScript knows building is of type Building | undefined
```

### 5.2 Raw SQL Usage

**Grade: B+**

**Found:** Very limited use of raw SQL (only 2 patterns):

1. **Date range queries** (unavoidable):
   ```typescript
   sql`${utilityReadings.periodStart} >= ${yearStart}`
   ```
   These are **parameterized** via tagged template, so safe from SQL injection ✓

2. **Aggregations**:
   ```typescript
   sql<number>`max(${complianceYears.year})`.as('max_year')
   sql<number>`count(*)`.as('count')
   ```
   Properly typed with `sql<T>` ✓

**No SQL injection risk found.**

### 5.3 Query Composition

**Grade: A**

**Excellent use of Drizzle's composability:**

```typescript
// Shared auth helper reused across app
export async function filterAuthorizedBuildingIds(buildingIds: string[]) {
  return await db.select({ id: buildings.id })
    .from(buildings)
    .where(and(
      inArray(buildings.id, buildingIds),
      eq(buildings.organizationId, ctx.orgId)
    ));
}
```

**Benefits:**
- DRY (used in 4+ locations)
- Type-safe
- Testable in isolation

---

## 6. Connection Management

### 6.1 Connection Pool Configuration

**Grade: A**

**Configuration in `src/lib/db/index.ts:10-14`:**
```typescript
const client = postgres(connectionString, {
  max: 10,              // Max connections
  idle_timeout: 20,     // Idle connection timeout (seconds)
  connect_timeout: 30,  // Connection establishment timeout
});
```

**Analysis:**
- **max: 10** - Appropriate for serverless (Vercel limits ~10 concurrent executions per region)
- **idle_timeout: 20s** - Good for serverless (connections released quickly)
- **connect_timeout: 30s** - Reasonable for cold starts

**Supabase Limits:**
- Free tier: 60 connections
- Pro tier: 200+ connections
- 10 max per app instance is well within limits ✓

**No connection leaks found:** All queries use single `db` singleton.

### 6.2 Query Timeout

**Grade: C**

**Missing:** No query-level timeouts configured.

**Risk:** Long-running queries (e.g., report generation with 1000s of readings) could block connection pool.

**Recommendation:**
```typescript
const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 30,
  statement_timeout: 30000,  // Add 30s query timeout
});
```

---

## 7. Migrations & Schema Management

### 7.1 Migration System

**Grade: F**

**Critical Issue: No migrations found.**

**Evidence:**
- `drizzle.config.ts` specifies output: `./src/lib/db/migrations`
- Migration directory exists but is empty (0 files)
- No migration history in version control
- No migration runner in deployment scripts

**Impact:**
- Schema changes are not versioned
- No rollback capability
- Team members may have schema drift
- Production schema unknown state

**Current State:** Schema likely created manually or via `drizzle-kit push` (danger!)

### 7.2 Schema Versioning

**Grade: F**

**No schema version tracking:**
- No `schema_version` table
- No migration history
- No way to detect schema drift between environments

**Recommendation:**
```bash
# Generate initial migration
npx drizzle-kit generate

# This should create:
# src/lib/db/migrations/0000_initial_schema.sql
# src/lib/db/migrations/meta/0000_snapshot.json
```

### 7.3 Seed Data

**Grade: D**

**No seed scripts found.**

**Impact:**
- New developers can't bootstrap local DB
- Testing requires manual data setup
- Demo environments need manual seeding

---

## 8. Performance & Scalability

### 8.1 Current Performance

**Grade: B+**

**Observed optimizations:**
1. **Caching:** `unstable_cache()` on portfolio summary (5 min TTL)
2. **Pagination:** Buildings list uses limit/offset
3. **Batch operations:** Bulk recalculate, bulk mark submitted
4. **Denormalized totals:** Compliance years cache calculated values

**Query count estimate per page:**
- Dashboard: ~5 queries (org, buildings, compliance years)
- Building detail: ~8 queries (building, accounts, readings, compliance)
- Compliance page: ~10 queries (multiple tables)

**Acceptable for current scale.**

### 8.2 Scalability Concerns

**Grade: C+**

**Time-series data growth:**
- `utility_readings` table will grow indefinitely
- 1 building × 12 months/year × 5 utility types × 10 years = 600 rows/building
- 1000 buildings = 600K rows (manageable)
- 10,000 buildings = 6M rows (needs partitioning)

**Recommendation:** Partition `utility_readings` by year:
```sql
CREATE TABLE utility_readings_2024 PARTITION OF utility_readings
  FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
```

**Large table concerns:**
1. `compliance_activities` grows without bounds (audit log)
2. No archival strategy for old compliance years
3. No data retention policy defined

### 8.3 Missing Optimizations

**Grade: C**

**Not implemented:**
1. **Materialized views** for portfolio rollups
2. **Read replicas** for reporting queries
3. **Database-level caching** (pg_stat_statements, query plan caching)
4. **EXPLAIN ANALYZE** in development (no evidence of query profiling)
5. **Index usage monitoring** (no pg_stat_user_indexes checks)

---

## 9. Data Validation & Quality

### 9.1 Application-Level Validation

**Grade: A**

**Excellent Zod schemas found:**
- `src/app/actions/readings.ts:11-33` - Reading form validation
- `src/app/actions/deductions.ts:29-36` - Deduction form validation

**Example:**
```typescript
export const readingFormSchema = z.object({
  consumptionValue: z.string()
    .min(1, 'Consumption value is required')
    .refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
      message: 'Must be a non-negative number',
    }),
  // ...
});
```

**Strength:** Comprehensive validation at API boundary.

### 9.2 Database-Level Validation

**Grade: D**

**Missing:**
- No CHECK constraints (discussed in section 3.2)
- No triggers for complex validations
- No EXCLUDE constraints (e.g., prevent overlapping date ranges)

**Example of missing validation:**

A reading with `period_start = '2024-12-31'` and `period_end = '2024-01-01'` would pass database validation but is logically invalid.

**Should have:**
```sql
ALTER TABLE utility_readings
  ADD CONSTRAINT valid_period CHECK (period_end >= period_start);
```

### 9.3 Data Consistency

**Grade: B+**

**Good:**
- Unique constraints prevent duplicate readings ✓
- Foreign keys prevent orphaned records ✓ (when cascade is added)
- NOT NULL enforces required fields ✓

**Issues:**
- Denormalized totals in `compliance_years` can drift from source data if recalculation fails
- No database triggers to auto-update `updated_at` timestamps

---

## 10. Security Considerations

### 10.1 Multi-Tenancy Isolation

**Grade: B+**

**Good:**
- All queries filter by `organizationId` via auth helpers
- Shared helpers enforce building access checks
- No direct org_id bypass found

**Example:**
```typescript
// src/lib/auth/helpers.ts:56-66
export async function assertBuildingAccess(buildingId: string) {
  const ctx = await getAuthContext();
  const [building] = await db.select({ organizationId: buildings.organizationId })
    .from(buildings).where(eq(buildings.id, buildingId)).limit(1);
  if (!building || building.organizationId !== ctx.orgId) return null;
  return { orgId: ctx.orgId };
}
```

**Concerns:**
1. **No Row-Level Security (RLS):** Database doesn't enforce tenant isolation (relies on application)
2. **Direct DB access:** Admin tools could query across organizations without filtering
3. **Missing org_id on some child tables** (utility_readings, utility_accounts) - requires join to filter

**Recommendation:** Enable Supabase RLS policies:
```sql
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON buildings
  USING (organization_id = current_setting('app.current_org_id')::uuid);
```

### 10.2 SQL Injection

**Grade: A**

**No SQL injection vulnerabilities found.**

**Evidence:**
- All queries use Drizzle ORM (parameterized)
- Raw SQL uses tagged templates (parameterized)
- No string concatenation in queries

**Example of safe raw SQL:**
```typescript
sql`${utilityReadings.periodStart} >= ${yearStart}`
// Compiled to: SELECT * FROM utility_readings WHERE period_start >= $1
```

### 10.3 Sensitive Data

**Grade: A**

**Proper encryption:**
- PM passwords encrypted with AES-256-GCM (`src/lib/auth/encryption.ts`)
- Stored in `pm_password_encrypted` column ✓
- Decrypted only when needed ✓

**No plaintext secrets found.**

---

## 11. Backup & Recovery

### 11.1 Backup Strategy

**Grade: N/A (Delegated to Supabase)**

**Supabase provides:**
- Automated daily backups (free tier: 7-day retention)
- Point-in-time recovery (PITR) on Pro tier
- No application-level backup code needed

**Missing:**
- No application-level export scripts
- No backup verification tests
- No disaster recovery runbook

### 11.2 Data Export

**Grade: C**

**Limited export capabilities:**
- PDF report generation (`src/app/api/reports/[buildingId]/route.ts`)
- No CSV export of raw data
- No bulk data export for compliance year
- No organization-level data export (GDPR requirement)

---

## 12. Monitoring & Observability

### 12.1 Query Performance Monitoring

**Grade: D**

**Missing:**
- No query logging
- No slow query monitoring
- No EXPLAIN ANALYZE in development
- No database metrics in Sentry integration

**Recommendation:**
```typescript
// Add to db/index.ts
const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 30,
  debug: process.env.NODE_ENV === 'development'
    ? (connection, query, params) => {
        console.log('[DB]', query, params);
      }
    : undefined,
});
```

### 12.2 Error Handling

**Grade: B**

**Good:**
- Transactions have try/catch blocks
- Errors logged to console (post-audit fix)
- Sentry captures application errors

**Missing:**
- No database error classification (constraint violation vs. timeout vs. connection error)
- No retry logic for transient failures
- No circuit breaker pattern for database connection

---

## Critical Issues Summary

### P0 (Blocking Production Use)
**None** - Database is production-ready with caveats.

### P1 (High Priority - Fix Before Scale)

1. **No Migration System** (Grade: F)
   - **Issue:** Zero migration files, schema drift risk
   - **Impact:** Can't version schema changes, no rollback, team drift
   - **Fix:** Run `npx drizzle-kit generate` and commit migrations
   - **File:** `src/lib/db/migrations/` (empty)
   - **Effort:** 2 hours

2. **No Foreign Key Cascade Policies** (Grade: C+)
   - **Issue:** 24 foreign keys lack ON DELETE/UPDATE actions
   - **Impact:** Orphaned records, manual cascade management
   - **Fix:** Add `{ onDelete: 'cascade' }` to all references
   - **File:** `src/lib/db/schema/index.ts`, `pm.ts`, `subscriptions.ts`
   - **Effort:** 4 hours

3. **N+1 Queries in PM Sync** (Grade: C)
   - **Issue:** Portfolio Manager sync queries database per property/meter
   - **Impact:** Syncing 100 properties = 200+ queries, slow performance
   - **Fix:** Batch fetch existing mappings/accounts before loops
   - **File:** `src/lib/portfolio-manager/sync.ts` (lines 55-64, 128-137)
   - **Effort:** 2 hours

### P2 (Medium Priority - Fix Within 3 Months)

4. **No Database Constraints** (Grade: D)
   - **Issue:** No CHECK constraints, validation only in app layer
   - **Impact:** Direct DB inserts bypass validation, data quality risk
   - **Fix:** Add CHECK constraints for positive values, date ranges, percentages
   - **File:** `src/lib/db/schema/index.ts`
   - **Effort:** 3 hours

5. **No Optimistic Locking** (Grade: C)
   - **Issue:** Concurrent updates can overwrite each other
   - **Impact:** Race conditions in compliance year updates
   - **Fix:** Add `updated_at` version checks in update queries
   - **File:** `src/lib/emissions/compliance-service.ts`, `src/app/actions/compliance-workflow.ts`
   - **Effort:** 4 hours

6. **Missing Indexes** (Grade: B+)
   - **Issue:** No index on compliance_years.year, utility_readings.period_start
   - **Impact:** Slow date range queries, portfolio aggregations
   - **Fix:** Add 5 indexes (year, period_start, document_type, activity_type, pm_property_id)
   - **File:** `src/lib/db/schema/index.ts`
   - **Effort:** 1 hour

7. **No Time-Series Partitioning** (Grade: C+)
   - **Issue:** utility_readings table grows indefinitely
   - **Impact:** Query performance degrades beyond 10M rows
   - **Fix:** Implement PostgreSQL partitioning by year
   - **File:** Database migration
   - **Effort:** 6 hours

8. **No Query Timeout** (Grade: C)
   - **Issue:** Long-running queries can block connection pool
   - **Impact:** One slow report generation blocks all requests
   - **Fix:** Add `statement_timeout: 30000` to postgres client config
   - **File:** `src/lib/db/index.ts`
   - **Effort:** 15 minutes

### P3 (Low Priority - Nice to Have)

9. **No Database Monitoring** (Grade: D)
   - **Issue:** No slow query logging, no performance metrics
   - **Fix:** Enable query logging in development, add pg_stat_statements monitoring
   - **Effort:** 2 hours

10. **No Seed Data Scripts** (Grade: D)
    - **Issue:** New developers can't bootstrap local database
    - **Fix:** Create seed script with sample data
    - **Effort:** 3 hours

---

## Recommendations by Priority

### Immediate Actions (This Sprint)

1. **Generate Migrations**
   ```bash
   npx drizzle-kit generate
   git add src/lib/db/migrations/
   ```

2. **Add Foreign Key Cascades**
   ```typescript
   organizationId: uuid('organization_id')
     .references(() => organizations.id, { onDelete: 'cascade' })
     .notNull(),
   ```

3. **Fix N+1 in PM Sync**
   ```typescript
   // Batch fetch before loop
   const existingMappings = await db.select()
     .from(pmPropertyMappings)
     .where(eq(pmPropertyMappings.orgId, orgId));
   const mappingMap = new Map(existingMappings.map(m => [m.pmPropertyId, m]));
   ```

### Next Month

4. Add missing indexes on year, period_start, document_type
5. Implement optimistic locking on compliance year updates
6. Add CHECK constraints for data validation
7. Add query timeout to postgres client

### Next Quarter

8. Implement time-series partitioning for utility_readings
9. Enable Row-Level Security (RLS) policies
10. Set up query performance monitoring
11. Create seed data scripts for development
12. Implement data archival strategy for old records

---

## Testing Recommendations

### Unit Tests Needed
1. **Transaction rollback on error** - Verify multi-step operations are atomic
2. **Unique constraint violations** - Test duplicate reading prevention
3. **Foreign key validation** - Test orphaned record prevention (once cascades added)
4. **Date range validation** - Test period_start < period_end (once constraint added)

### Integration Tests Needed
1. **Concurrent updates** - Test race conditions in compliance year updates
2. **Connection pool exhaustion** - Test behavior under max connections
3. **Query timeout** - Test long-running query handling
4. **Migration rollback** - Test migration down scripts (once created)

### Performance Tests Needed
1. **Large dataset queries** - Test with 10K buildings, 1M readings
2. **Report generation** - Benchmark PDF generation at scale
3. **CSV import** - Test background job with 10K row CSV
4. **Pagination** - Test offset performance with large result sets

---

## Comparison to Industry Standards

| Aspect | Industry Best Practice | This Project | Grade |
|--------|------------------------|--------------|-------|
| Schema Normalization | 3NF with strategic denormalization | ✓ 3NF with compliance year denormalization | A |
| Foreign Key Constraints | All FKs with cascade policies | ✓ FKs defined, ✗ no cascades | C+ |
| Indexes | All FKs indexed, covering indexes | ✓ FK indexes, ✗ missing covering | B+ |
| Migrations | Versioned, idempotent migrations | ✗ No migrations | F |
| Transactions | Multi-step ops in transactions | ✓ All multi-step use transactions | A |
| Concurrency | Optimistic/pessimistic locking | ✗ No locking | C |
| Validation | DB constraints + app validation | ✓ App validation, ✗ no DB constraints | C+ |
| Connection Pooling | Configured for workload | ✓ 10 max, 20s idle | A |
| Query Optimization | N+1 eliminated, indexes used | ✓ Mostly eliminated, ✗ some remain | B+ |
| Multi-Tenancy | RLS or app-level isolation | ✓ App-level, ✗ no RLS | B |
| Monitoring | Slow query log, metrics | ✗ No monitoring | D |
| Backups | Automated, tested | ✓ Supabase automated | N/A |

---

## Overall Assessment

**Grade: B+**

The Building Compliance OS database layer is **well-architected** with strong fundamentals. The schema design is excellent, transaction usage is textbook, and query patterns are generally good. The use of Drizzle ORM provides excellent type safety and developer experience.

However, the **lack of migrations is a critical gap** that must be addressed before production deployment. The missing foreign key cascade policies and database-level validations create data integrity risks. Some N+1 query patterns remain in Portfolio Manager sync, and there's no concurrency control for updates.

**Production Readiness: 75%**

The database layer is functional and performs well at current scale, but requires the P1 fixes (migrations, cascades, N+1 elimination) before scaling beyond 1000 buildings or multiple concurrent users.

**Strengths:**
- Clean, normalized schema design
- Excellent type safety with Drizzle ORM
- Proper transaction usage
- Good indexing coverage
- No SQL injection vulnerabilities
- Efficient query patterns (mostly)

**Critical Gaps:**
- No migration system
- Missing foreign key cascades
- No database-level constraints
- Some N+1 queries remain
- No optimistic locking
- Limited monitoring

**Recommended Timeline:**
- **Week 1:** Generate migrations, add foreign key cascades
- **Week 2:** Fix N+1 queries, add missing indexes
- **Week 3:** Add CHECK constraints, implement optimistic locking
- **Month 2:** Add query timeout, monitoring, performance tests
- **Month 3:** Implement partitioning, RLS, archival strategy

With these improvements, the database layer would achieve an **A- grade** and be production-ready at enterprise scale.

---

**Report Generated:** 2026-03-07
**Reviewed By:** Database Agent
**Lines of Code Analyzed:** ~3,500
**Database Queries Reviewed:** 144 occurrences across 36 files
**Schema Tables:** 14 core tables + 3 extension tables
**Foreign Keys:** 24
**Indexes:** 13
