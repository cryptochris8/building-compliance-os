# Performance Audit Report
**Building Compliance OS**
**Date:** 2026-03-07
**Auditor:** Performance Agent (Senior Performance Engineer)
**Model:** Claude Sonnet 4.5

---

## Executive Summary

**Overall Grade: B-**

The Building Compliance OS demonstrates **solid performance fundamentals** with several critical optimizations already implemented from a previous audit. The application successfully addresses N+1 query patterns, implements database indexes, uses connection pooling, and employs caching strategies. However, several **P1 and P2 performance issues remain** that could significantly impact scalability and user experience at portfolio scale.

### Critical Metrics
- **Database Queries:** Good (N+1 patterns resolved, indexes present)
- **Caching Strategy:** Fair (limited scope, short TTL)
- **Frontend Bundle:** Not Assessed (build required)
- **Rate Limiting:** Basic (in-memory, not distributed)
- **Async Operations:** Good (CSV imports backgrounded via Inngest)
- **Pagination:** Partial (present but limited)

---

## Performance Issues Summary

### P1 Issues (High Impact)

#### 1. **Sequential Processing in Portfolio Recalculation** ⚠️ HIGH
**Location:** `src/lib/emissions/compliance-service.ts:173-185`

```typescript
export async function recalculateAllBuildings(orgId: string, year: number) {
  const orgBuildings = await db.select({ id: buildings.id })
    .from(buildings).where(eq(buildings.organizationId, orgId));
  const results: ComplianceResultWithBreakdown[] = [];
  for (const b of orgBuildings) {  // ⚠️ SEQUENTIAL
    try {
      const r = await calculateBuildingCompliance(b.id, year);
      results.push(r);
    } catch (err) {
      console.error('Failed to calculate compliance...');
    }
  }
  return results;
}
```

**Impact:**
- Portfolio with 100 buildings: ~50-100 seconds (assuming 500ms-1s per building)
- Portfolio with 500 buildings: 4-8 minutes
- Blocks calling thread during entire operation

**Recommendation:**
Use `Promise.all()` with batching to parallelize calculations:

```typescript
const BATCH_SIZE = 10;
const results: ComplianceResultWithBreakdown[] = [];
for (let i = 0; i < orgBuildings.length; i += BATCH_SIZE) {
  const batch = orgBuildings.slice(i, i + BATCH_SIZE);
  const batchResults = await Promise.all(
    batch.map(b => calculateBuildingCompliance(b.id, year).catch(err => {
      console.error('Failed:', err);
      return null;
    }))
  );
  results.push(...batchResults.filter(r => r !== null));
}
```

Or move to Inngest background job for very large portfolios.

---

#### 2. **Sequential Email Processing in Deadline Reminders** ⚠️ HIGH
**Location:** `src/lib/notifications/deadline-reminders.ts:89-123`

```typescript
export async function generateReminderEmail(
  reminder: DeadlineReminder,
  recipientEmail: string
): Promise<ReminderEmail> {
  // ... build email content ...
  await resend.emails.send({  // ⚠️ BLOCKING NETWORK CALL
    from: fromAddress,
    to: recipientEmail,
    subject,
    html: body.replace(/\n/g, '<br/>'),
  });
  return { to: recipientEmail, subject, body };
}
```

**Impact:**
- Called in a loop (likely) for multiple reminders
- Each email send: ~100-500ms network latency
- 100 reminders = 10-50 seconds of blocking I/O

**Recommendation:**
1. Batch email sends using Resend's batch API
2. Return immediately after queuing (don't await in loop)
3. Move to Inngest scheduled job for production

---

#### 3. **Portfolio Manager Sync: Sequential Meter Data Fetches** ⚠️ HIGH
**Location:** `src/lib/portfolio-manager/sync.ts:124-193`

```typescript
for (const meter of meters) {  // ⚠️ SEQUENTIAL NETWORK I/O
  // ... account setup ...
  try {
    const consumptionData = await client.getMeterData(meter.id, startDate, endDate);
    for (const dataPoint of consumptionData) {
      await db.insert(utilityReadings).values({...});  // ⚠️ Individual INSERTs
      importedCount++;
    }
  } catch (err) {
    console.error('Failed to fetch meter data...');
  }
}
```

**Impact:**
- Property with 20 meters: 10-60 seconds (depending on API latency)
- Individual INSERT per reading (no batching)
- Blocks for entire sync duration

**Recommendation:**
1. Parallelize meter fetches with `Promise.all()` (batch of 5-10)
2. Batch INSERT operations (use `.values([array])`)
3. Consider moving to Inngest for long syncs

---

#### 4. **Missing Pagination on Compliance Calendar** ⚠️ MEDIUM-HIGH
**Location:** `src/app/(dashboard)/compliance/page.tsx:36-89`

```typescript
const allCyRecords = await db.select().from(complianceYears)
  .where(inArray(complianceYears.buildingId, buildingIds))
  .orderBy(desc(complianceYears.year));  // ⚠️ NO LIMIT
```

**Impact:**
- Portfolio with 500 buildings × 5 years = 2,500 records
- No pagination = loads all records on page load
- Memory and rendering performance degradation

**Recommendation:**
Add pagination or limit to recent N years (e.g., last 3 years):

```typescript
const THREE_YEARS_AGO = new Date().getFullYear() - 3;
.where(and(
  inArray(complianceYears.buildingId, buildingIds),
  gte(complianceYears.year, THREE_YEARS_AGO)
))
```

---

#### 5. **Cache TTL Too Short for Expensive Queries** ⚠️ MEDIUM
**Location:** `src/lib/emissions/compliance-service.ts:247-253`

```typescript
export function getComplianceSummary(orgId: string, year: number) {
  return unstable_cache(
    () => _getComplianceSummary(orgId, year),
    ['portfolio-summary', orgId, String(year)],
    { revalidate: 300, tags: [...] }  // ⚠️ 5 minutes only
  )();
}
```

**Impact:**
- Portfolio summary query is expensive (joins buildings + compliance_years)
- 5-minute TTL means frequent recalculation
- Compliance data rarely changes more than once per hour

**Recommendation:**
Increase TTL to 1 hour (3600s) and rely on tag-based revalidation:

```typescript
{ revalidate: 3600, tags: ['portfolio-summary-' + orgId + '-' + year] }
```

Tag revalidation already happens on data mutations (readings, deductions).

---

### P2 Issues (Medium Impact)

#### 6. **Recalculation Triggered on Every Reading CRUD** ⚠️ MEDIUM
**Location:** `src/app/actions/readings.ts:77,118,148`

```typescript
await triggerRecalculation(data.buildingId).catch(console.error);
```

**Location:** `src/lib/emissions/recalculation.ts:6-25`

```typescript
export async function triggerRecalculation(buildingId: string) {
  const readings = await db.select({ periodStart: utilityReadings.periodStart })
    .from(utilityReadings).where(eq(utilityReadings.buildingId, buildingId));

  const years = new Set<number>();
  for (const r of readings) {
    const year = new Date(r.periodStart).getFullYear();
    years.add(year);
  }

  for (const year of years) {  // ⚠️ Recalculates ALL years
    await calculateBuildingCompliance(buildingId, year);
  }
}
```

**Impact:**
- Adding a single reading for 2024 recalculates 2024, 2023, 2022, etc.
- Each recalculation: ~200-500ms
- User waits for all years to complete before seeing response

**Recommendation:**
Only recalculate the affected year:

```typescript
export async function triggerRecalculation(buildingId: string, year?: number) {
  if (year) {
    await calculateBuildingCompliance(buildingId, year);
    return;
  }
  // Full recalc only when year unknown
  // ...existing code...
}
```

Update callers to pass the year from the reading's `periodYear`.

---

#### 7. **No Bundle Size Optimization Assessment** ⚠️ MEDIUM
**Location:** Client-side JavaScript bundles

**Observation:**
- Build artifacts exist but no bundle analysis performed
- Recharts library (data visualization) is imported in multiple chart components
- No evidence of code splitting beyond Next.js defaults
- No lazy loading of heavy components (charts, PDF generator)

**Recommendation:**
1. Run `npm run build` and analyze output
2. Implement dynamic imports for chart components:

```typescript
const FuelBreakdownChart = dynamic(() =>
  import('@/components/compliance/fuel-breakdown-chart').then(m => m.FuelBreakdownChart),
  { loading: () => <Skeleton /> }
);
```

3. Consider lighter chart library alternatives (e.g., Chart.js, Victory) or lazy-load Recharts
4. Add bundle analyzer: `@next/bundle-analyzer`

---

#### 8. **In-Memory Rate Limiting (Not Distributed)** ⚠️ MEDIUM
**Location:** `src/lib/rate-limit.ts:7-66`

```typescript
const rateLimit = (options) => {
  const tokenCounts = new Map<string, { count: number; resetTime: number }>();
  // ⚠️ In-memory only - lost on restart, not shared across instances
  // ...
};
```

**Impact:**
- Single-instance: Works fine
- Multi-instance (horizontal scaling): Each instance has separate counters
- Rate limit can be bypassed by distributing requests across instances
- Memory leak risk if not cleaned up properly

**Recommendation:**
For production at scale:
1. Implement Redis-based rate limiting (e.g., `@upstash/ratelimit`)
2. Or use Vercel Edge Config for distributed rate limiting
3. Keep in-memory version for development

---

#### 9. **Missing Index on compliance_years.buildingId + year** ⚠️ LOW-MEDIUM
**Location:** `src/lib/db/schema/index.ts:123-125`

```typescript
}, (table) => [
  uniqueIndex('unique_compliance_year').on(table.buildingId, table.year),
]);
```

**Observation:**
- Unique index exists on `(buildingId, year)`
- This serves as a composite index for queries filtering by buildingId
- However, many queries filter by `year` alone (e.g., `getComplianceSummary`)

**Impact:**
- Query: `WHERE year = 2024` cannot use the composite index efficiently
- Full table scan for year-based filtering

**Recommendation:**
Add separate index on `year` column:

```typescript
}, (table) => [
  uniqueIndex('unique_compliance_year').on(table.buildingId, table.year),
  index('idx_compliance_years_year').on(table.year),
]);
```

---

#### 10. **No Database Query Timeout Configuration** ⚠️ LOW
**Location:** `src/lib/db/index.ts:10-14`

```typescript
const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 30,
  // ⚠️ No statement_timeout or query timeout
});
```

**Impact:**
- Long-running queries (e.g., due to missing index or bad query) can block connections
- No automatic termination of runaway queries
- Connection pool exhaustion risk

**Recommendation:**
Add query timeout:

```typescript
const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 30,
  statement_timeout: 30000,  // 30 seconds
  query_timeout: 30000,
});
```

---

### P3 Issues (Low Impact / Optimization Opportunities)

#### 11. **CSV Import: Individual Queries in Loop** ✓ MITIGATED
**Location:** `src/lib/inngest/process-csv-import.ts:70-93`

**Status:** Already backgrounded via Inngest (good!), but still has optimization opportunity.

```typescript
for (let i = 0; i < rows.length; i++) {
  // ... validation ...
  const existingAccounts = await db.select()  // ⚠️ Query per row
    .from(utilityAccounts)
    .where(and(...));
  // ...
  await db.insert(utilityReadings).values({...});  // ⚠️ Insert per row
}
```

**Recommendation:**
Pre-fetch all utility accounts for the building once, then cache in memory:

```typescript
const allAccounts = await db.select()
  .from(utilityAccounts)
  .where(eq(utilityAccounts.buildingId, buildingId));
const accountCache = new Map(allAccounts.map(a => [a.utilityType + a.accountNumber, a.id]));

// Then in loop:
const key = utilityType + (accountNumber || '');
accountId = accountCache.get(key) || (/* create new */);
```

Also batch INSERT operations (collect values, insert in batches of 100).

---

#### 12. **Middleware Auth Check on Every Request** ✓ ACCEPTABLE
**Location:** `src/middleware.ts:58-60`

```typescript
const { data: { user } } = await supabase.auth.getUser();
```

**Status:** Standard Next.js middleware pattern. Supabase SDK caches tokens in cookies.

**Impact:** Minimal - cookie-based auth is fast (~10-50ms).

**Recommendation:** No immediate action needed. Monitor if auth latency becomes an issue at scale.

---

## Positive Findings ✅

### 1. **N+1 Queries Resolved**
**Locations:**
- `src/app/(dashboard)/buildings/page.tsx:61-79` - Uses subquery + LEFT JOIN for latest compliance status
- `src/lib/emissions/compliance-service.ts:189-207` - Single query with JOIN for portfolio summary
- `src/app/(dashboard)/compliance/page.tsx:43-47` - Batch query with `inArray()` for all buildings
- `src/lib/notifications/deadline-reminders.ts:39-42` - Batch query for compliance years

**Verification:** ✅ All major list views use batch queries or JOINs instead of N+1 loops.

---

### 2. **Database Indexes Properly Implemented**
**Location:** `src/lib/db/schema/index.ts`

**Indexes Found:**
- `idx_users_org_id` on `users.organizationId`
- `idx_buildings_org_id` on `buildings.organizationId`
- `idx_utility_accounts_building_id` on `utility_accounts.buildingId`
- `idx_utility_readings_building_id` on `utility_readings.buildingId`
- `unique_reading` on `(utilityAccountId, periodStart, periodEnd)`
- `idx_documents_building_id` on `documents.buildingId`
- `idx_documents_compliance_year_id` on `documents.complianceYearId`
- `idx_import_jobs_org_id` on `import_jobs.organizationId`
- `idx_compliance_activities_building_id` on `compliance_activities.buildingId`
- `idx_deductions_compliance_year_id` on `deductions.complianceYearId`
- `unique_compliance_year` on `(buildingId, year)`

**Status:** ✅ Comprehensive indexing on foreign keys and common query patterns.

---

### 3. **Connection Pooling Configured**
**Location:** `src/lib/db/index.ts:10-14`

```typescript
const client = postgres(connectionString, {
  max: 10,              // ✅ Pool size limit
  idle_timeout: 20,     // ✅ 20 seconds
  connect_timeout: 30,  // ✅ 30 seconds
});
```

**Status:** ✅ Sensible defaults for connection pooling.

---

### 4. **Database Transactions Used for Multi-Step Operations**
**Locations:**
- `src/lib/emissions/compliance-service.ts:131-164` - Compliance year upsert + deductions
- `src/app/actions/deductions.ts:58-81` - Create deduction + update totals + activity log
- `src/app/api/webhooks/stripe/route.ts:54-71` - Subscription + org tier update

**Status:** ✅ Proper use of transactions to maintain data consistency.

---

### 5. **CSV Import Backgrounded via Inngest**
**Location:** `src/lib/inngest/process-csv-import.ts`

**Status:** ✅ Long-running import operations moved to background jobs. No blocking user requests.

---

### 6. **Next.js Caching Strategy Implemented**
**Location:** `src/lib/emissions/compliance-service.ts:247-253`

```typescript
export function getComplianceSummary(orgId: string, year: number) {
  return unstable_cache(
    () => _getComplianceSummary(orgId, year),
    ['portfolio-summary', orgId, String(year)],
    { revalidate: 300, tags: ['portfolio-summary-' + orgId + '-' + year] }
  )();
}
```

**Status:** ✅ Tag-based cache invalidation + time-based revalidation. Good pattern.

**Opportunity:** Increase TTL from 300s to 3600s (see P1 issue #5).

---

### 7. **Pagination Implemented on Buildings List**
**Location:** `src/app/(dashboard)/buildings/page.tsx:66-79`

```typescript
const PAGE_SIZE = 20;
// ...
.limit(PAGE_SIZE)
.offset(offset);
```

**Status:** ✅ Buildings page uses pagination with 20 items per page.

---

## Performance Benchmarks (Estimated)

### Database Query Performance

| Query Type | Estimated Time | Notes |
|------------|----------------|-------|
| Buildings list (paginated) | 50-150ms | With JOIN for compliance status |
| Portfolio summary | 200-500ms | Depends on building count |
| Building compliance calculation | 300-800ms | Includes readings fetch + calculation |
| CSV import (100 rows) | 5-10s | Backgrounded via Inngest ✅ |
| Recalculate portfolio (100 buildings) | 50-100s | ⚠️ Sequential - should parallelize |

### API Response Times (Estimated)

| Endpoint | Target | Estimated Actual | Status |
|----------|--------|------------------|--------|
| GET /buildings | <200ms | 100-200ms | ✅ Good |
| GET /api/compliance/portfolio | <500ms | 300-600ms | ⚠️ Fair |
| POST /api/reports/bulk | <200ms | 50-150ms | ✅ Good (returns URLs only) |
| GET /dashboard | <1s | 500ms-1.5s | ⚠️ Fair |

---

## Scalability Assessment

### Current Capacity (Estimated)

| Metric | Small Org | Medium Org | Large Org | Notes |
|--------|-----------|------------|-----------|-------|
| Buildings | 1-10 | 50-100 | 500+ | |
| Users | 1-5 | 10-50 | 100+ | |
| Readings/year/building | ~120 | ~120 | ~120 | (10 readings/month) |
| **Portfolio Summary Load Time** | 100-200ms | 300-500ms | 1-3s | ⚠️ Linear degradation |
| **Dashboard Load Time** | 200-400ms | 500ms-1s | 2-5s | ⚠️ Needs optimization |
| **Recalculate All Buildings** | 5-10s | 30-60s | 4-8min | ⚠️ Sequential processing |

### Scaling Bottlenecks

1. **Sequential portfolio recalculation** - Will time out at 500+ buildings
2. **No horizontal scaling for rate limiter** - In-memory state doesn't scale
3. **Compliance calendar unbounded query** - Memory issues at 1000+ buildings
4. **Short cache TTL** - Increased database load at scale

---

## Infrastructure Recommendations

### Database

✅ **Already Implemented:**
- Connection pooling (max: 10)
- Indexes on foreign keys
- Unique constraints prevent duplicates
- Transactions for data consistency

⚠️ **Missing:**
- Query timeout configuration
- Read replicas for reporting queries (future, at scale)
- Database monitoring/slow query logging (should enable in production)

### Caching

✅ **Already Implemented:**
- Next.js `unstable_cache` with tag-based invalidation
- 5-minute TTL on portfolio summary

⚠️ **Recommendations:**
- Increase cache TTL to 1 hour for expensive queries
- Consider Redis for distributed caching (when multi-instance)
- Implement stale-while-revalidate pattern for better UX

### Background Jobs

✅ **Already Implemented:**
- Inngest for CSV imports
- Proper error handling and status tracking

⚠️ **Recommendations:**
- Move portfolio recalculation to Inngest (for large portfolios)
- Add deadline reminder scheduled job
- Consider queue batching for email sends

### Rate Limiting

⚠️ **Current:** In-memory (single instance only)

**Recommendations:**
- For production: Migrate to Redis-based rate limiting
- Or use Vercel Edge Config for distributed state
- Implement different limits per tier (free: 100/hr, pro: 1000/hr, etc.)

---

## Bundle Size Analysis

**Status:** Build completed but bundle analysis deferred pending build completion.

**Recommendations:**
1. Install `@next/bundle-analyzer`
2. Implement code splitting for heavy components (Recharts, PDF renderer)
3. Use dynamic imports for chart components
4. Consider lazy loading @react-pdf/renderer (only used for report generation)

**Expected Wins:**
- First Load JS reduction: ~100-200 KB by lazy-loading charts
- Faster initial page load: ~500ms improvement

---

## Critical Path Optimization

### User Journey: View Dashboard (Portfolio Summary)

**Current Flow:**
1. Middleware auth check: ~20-50ms ✅
2. Get user org ID: ~10-20ms ✅
3. Fetch portfolio summary (with cache): ~100-500ms ⚠️
4. Render React components: ~50-150ms ✅

**Optimization Opportunities:**
- Cache hit rate monitoring (should be >90%)
- Increase cache TTL (reduce DB load)
- Consider server component streaming for faster TTFB

### User Journey: Add Reading → See Updated Compliance

**Current Flow:**
1. Validate + insert reading: ~50-100ms ✅
2. Trigger recalculation (ALL years): ~500ms-2s ⚠️
3. Revalidate cache tags: ~10ms ✅
4. Redirect/refresh: user sees update

**Optimization:**
- Only recalculate affected year: ~200-500ms (60-75% faster)
- Move to background job for very long recalcs
- Show optimistic UI update while recalculating

---

## Monitoring & Observability

✅ **Already Implemented:**
- Sentry for error tracking (client/server/edge)

⚠️ **Missing:**
- Database query performance monitoring
- Slow query logging
- Cache hit/miss rate tracking
- API endpoint response time metrics
- Background job completion time tracking

**Recommendations:**
1. Enable Sentry performance monitoring (transactions, database spans)
2. Add custom instrumentation for:
   - Portfolio summary query time
   - Recalculation duration
   - Cache hit rates
3. Set up alerts:
   - Query time > 2s
   - Recalculation time > 10s
   - Cache hit rate < 80%

---

## Action Items by Priority

### Immediate (P1) - Next Sprint

1. ✅ **Parallelize portfolio recalculation** (Issue #1)
   - Use `Promise.all()` with batching
   - Or move to Inngest for 100+ buildings

2. ✅ **Optimize recalculation to single year** (Issue #6)
   - Pass year parameter to `triggerRecalculation()`
   - Only recalculate affected year

3. ✅ **Increase cache TTL** (Issue #5)
   - Portfolio summary: 300s → 3600s
   - Rely on tag-based invalidation

4. ✅ **Add pagination/limit to compliance calendar** (Issue #4)
   - Limit to last 3 years by default
   - Or implement pagination

### Short-term (P2) - Next Quarter

5. ⚠️ **Parallelize PM meter data sync** (Issue #3)
   - Batch API calls with `Promise.all()`
   - Batch database INSERTs

6. ⚠️ **Optimize email sending** (Issue #2)
   - Use Resend batch API
   - Move to scheduled Inngest job

7. ⚠️ **Bundle size analysis & optimization** (Issue #7)
   - Run bundle analyzer
   - Lazy-load chart components
   - Consider lighter charting library

8. ⚠️ **Add index on compliance_years.year** (Issue #9)
   - Improves year-based filtering queries

### Long-term (P3) - Future

9. ⚠️ **Distributed rate limiting** (Issue #8)
   - Redis-based rate limiter for production
   - Or Vercel Edge Config

10. ⚠️ **CSV import optimization** (Issue #11)
    - Pre-fetch utility accounts
    - Batch INSERTs (100 rows at a time)

11. ⚠️ **Database monitoring** (Observability)
    - Slow query logging
    - Performance metrics dashboard
    - Alert on query time > 2s

---

## Conclusion

Building Compliance OS has **strong performance fundamentals** thanks to the previous audit's focus on N+1 queries and database indexing. The application is production-ready for small to medium organizations (1-100 buildings).

**Key Strengths:**
- ✅ No N+1 query patterns
- ✅ Comprehensive database indexes
- ✅ Connection pooling configured
- ✅ Background jobs for long operations
- ✅ Database transactions for consistency
- ✅ Caching with tag-based invalidation

**Critical Gaps:**
- ⚠️ Sequential processing limits portfolio scalability
- ⚠️ Short cache TTL increases database load
- ⚠️ Missing pagination on compliance calendar
- ⚠️ No distributed rate limiting

**Scalability Ceiling:**
- **Current:** 100-200 buildings per organization
- **After P1 fixes:** 500-1000 buildings per organization
- **With full optimization:** 5000+ buildings per organization

**Recommended Next Steps:**
1. Implement P1 issues (parallelization, caching, pagination)
2. Add performance monitoring via Sentry transactions
3. Run bundle analysis and optimize frontend
4. Test with production-scale data (500+ buildings)

---

## Appendix: Performance Testing Checklist

- [ ] Load test portfolio summary endpoint (100, 500, 1000 buildings)
- [ ] Benchmark recalculation time (single building, 100 buildings)
- [ ] Test CSV import with 1000+ rows
- [ ] Measure cache hit rate over 24 hours
- [ ] Profile frontend bundle size
- [ ] Test rate limiter under load
- [ ] Verify database query plans (EXPLAIN ANALYZE)
- [ ] Monitor memory usage during portfolio recalculation
- [ ] Test concurrent user access (10, 50, 100 users)
- [ ] Benchmark middleware auth overhead

---

**Report Generated:** 2026-03-07
**Next Review:** After P1 issues resolved (30 days)
