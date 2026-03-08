# Code Review Report: Building Compliance OS

**Reviewer:** Code Review Agent (Claude Opus 4.6)
**Date:** 2026-03-07
**Scope:** Full codebase review -- all source files under `src/`
**Overall Grade:** B-

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Correctness Findings](#correctness-findings)
3. [Security Findings](#security-findings)
4. [Performance Findings](#performance-findings)
5. [Maintainability Findings](#maintainability-findings)
6. [Architecture Assessment](#architecture-assessment)
7. [Findings Summary Table](#findings-summary-table)
8. [Recommendations](#recommendations)

---

## Executive Summary

Building Compliance OS is a well-structured Next.js 16 SaaS application for NYC Local Law 97 building emissions compliance. The codebase demonstrates competent engineering with a clean calculation engine, proper use of server actions, and a well-designed jurisdiction plugin system. Previous audit findings (IDOR, plaintext passwords, SQL injection) have been addressed.

However, significant issues remain across correctness, security, and maintainability dimensions. The most critical findings are: (1) a building detail page that renders hardcoded demo data instead of real database data, making it functionally broken in production; (2) an open redirect vulnerability in the auth callback; and (3) pervasive code duplication in confidence assessment logic. The codebase is at the "functional MVP" stage but requires hardening before production deployment.

**Strengths:**
- Pure, testable calculation engine (`calculator.ts`, `mixed-use.ts`) with 53 passing tests
- Consistent authorization pattern via `assertBuildingAccess()` and `filterAuthorizedBuildingIds()`
- Proper AES-256-GCM encryption for PM credentials
- Transactions for all multi-step writes
- Clean jurisdiction plugin architecture
- Good use of Next.js patterns (RSC, server actions, middleware)
- Proper Stripe webhook signature verification

**Weaknesses:**
- Critical page renders demo data instead of real data
- Several security gaps (open redirect, missing RBAC, missing CSP)
- Significant code duplication across confidence modules
- In-memory rate limiter does not survive restarts or scale across instances
- Feature gate checks are not consistently enforced
- Some dead code and unused imports

---

## Correctness Findings

### CR-1: Building Detail Page Uses Hardcoded Demo Data [CRITICAL]

**File:** `src/app/(dashboard)/buildings/[id]/page.tsx`
**Lines:** 8-32, 42-49

The building detail page (the main page users see after clicking a building) renders entirely from `DEMO_BUILDING`, `DEMO_ACCOUNTS`, and `DEMO_READINGS` constants. The actual `id` param is received but never used to query the database. Every building shows the same "350 Fifth Avenue" data regardless of which building was selected.

```typescript
const DEMO_BUILDING = {
  name: "350 Fifth Avenue",
  // ... hardcoded
};

export default async function BuildingDetailPage({ params }) {
  const { id } = await params;
  const building = DEMO_BUILDING; // BUG: Never queries DB
```

**Impact:** Users cannot view actual building information. This page is the primary building detail view and is completely non-functional.
**Severity:** CRITICAL

### CR-2: Duplicate Type Definitions for Compliance Service Types

**Files:**
- `src/lib/emissions/compliance-service.ts` (lines 16-45)
- `src/lib/emissions/types.ts` (lines 1-39)

`ComplianceResultWithBreakdown` and `PortfolioSummary` are defined in both files. The `types.ts` file was clearly created to be the shared, client-safe version, but the `compliance-service.ts` file also defines its own copies. Components import from one or the other inconsistently.

**Impact:** Type drift risk -- changes in one definition may not be reflected in the other.
**Severity:** MEDIUM

### CR-3: Triplicated Confidence Assessment Logic

**Files:**
- `src/lib/emissions/confidence.ts` (lines 82-134) -- `assessConfidenceFromData()`
- `src/lib/emissions/confidence-utils.ts` (lines 13-65) -- identical `assessConfidenceFromData()`

The `assessConfidenceFromData` function is duplicated verbatim across two files. The `confidence.ts` file also has `assessConfidence()` (DB-backed version) which duplicates the same logic a third time. This creates a maintenance burden where fixes must be applied in three places.

**Impact:** Bug fixes or logic changes must be applied in multiple places.
**Severity:** MEDIUM

### CR-4: `normalizeConsumption` Default Fallthrough Silently Returns Unconverted Values

**File:** `src/lib/emissions/calculator.ts`
**Lines:** 29-57

The `normalizeConsumption` function has a default case that returns the raw value unchanged for unrecognized utility types or units. For example, if electricity data arrives in "MJ" units, it will be treated as if it were kWh, producing silently wrong emissions calculations.

```typescript
case 'electricity':
  if (unit === 'kWh' || unit === 'kwh') return { value, unit: 'kWh' };
  if (unit === 'MWh' || unit === 'mwh') return { value: value * 1000, unit: 'kWh' };
  return { value, unit: 'kWh' }; // Treats unknown units as kWh
```

**Impact:** Silently incorrect emissions calculations for non-standard units.
**Severity:** HIGH

### CR-5: GJ-to-kBtu Conversion Declared but Not Applied in PM Unit Map

**File:** `src/lib/portfolio-manager/types.ts`
**Line:** 90

The PM unit map maps `'GJ'` to `'kBtu'` with a comment "1 GJ = 947.817 kBtu, handled in conversion." However, the actual conversion factor is never applied anywhere. When PM data arrives in GJ, it will be stored as-is with the unit label "kBtu", causing a ~948x magnitude error.

```typescript
'GJ': 'kBtu', // 1 GJ = 947.817 kBtu, handled in conversion
// But no conversion is "handled" anywhere
```

**Impact:** Massive emissions calculation errors for buildings using GJ-based meters.
**Severity:** HIGH

### CR-6: `deleteReading` Does Not Verify Reading Belongs to Specified Building

**File:** `src/app/actions/readings.ts`
**Lines:** 128-159

The `deleteReading` function accepts `id` and `buildingId` as separate parameters. It verifies the user has access to `buildingId`, but does not verify that the reading with `id` actually belongs to that building. An attacker with access to building A could delete a reading from building B by passing building A's ID.

```typescript
export async function deleteReading(id: string, buildingId: string) {
  // Checks access to buildingId but never verifies reading.id belongs to buildingId
  const access = await assertBuildingAccess(buildingId);
  // ...
  await db.delete(utilityReadings).where(eq(utilityReadings.id, id));
```

**Impact:** Cross-building reading deletion within the same organization.
**Severity:** HIGH

### CR-7: `updateReading` Does Not Verify Reading Ownership

**File:** `src/app/actions/readings.ts`
**Lines:** 87-126

Similar to CR-6, `updateReading` takes a reading `id` and form data with `buildingId`. It verifies access to the building from form data but never checks that the reading `id` actually belongs to that building.

**Impact:** A user could modify readings belonging to a different building in their org.
**Severity:** HIGH

### CR-8: `deleteDeduction` Does Not Verify Deduction Ownership

**File:** `src/app/actions/deductions.ts`
**Lines:** 126-151

Same pattern: `deleteDeduction(id, buildingId, complianceYearId)` verifies access to `buildingId` but never checks that deduction `id` actually belongs to `buildingId`.

**Impact:** Cross-building deduction manipulation.
**Severity:** MEDIUM

### CR-9: `updateDeduction` Does Not Verify Deduction Ownership

**File:** `src/app/actions/deductions.ts`
**Lines:** 92-124

`updateDeduction(id, data)` verifies access to `data.buildingId` but never checks that deduction `id` belongs to that building.

**Impact:** Cross-building deduction manipulation.
**Severity:** MEDIUM

### CR-10: `deleteDocument` Does Not Verify Document Belongs to Building

**File:** `src/app/actions/documents.ts`
**Lines:** 74-97

`deleteDocument(id, buildingId)` checks building access but does not verify the document actually belongs to that building. Could delete documents from other buildings.

**Impact:** Cross-building document deletion.
**Severity:** MEDIUM

### CR-11: `revalidateTag` Called with Extra Arguments

**File:** `src/app/actions/readings.ts`
**Line:** 80

```typescript
revalidateTag('portfolio-summary-' + access.orgId + '-' + data.periodYear, 'max');
```

`revalidateTag` from Next.js only takes one argument (the tag string). Passing `'max'` as a second argument is likely ignored but indicates misunderstanding of the API. This pattern appears in multiple server actions.

**Impact:** Cosmetic / potential future breakage if Next.js starts validating args.
**Severity:** LOW

### CR-12: Onboarding `hasReadings` Is Always False

**File:** `src/app/actions/onboarding.ts`
**Lines:** 47

```typescript
const hasReadings = false;
// Comment: "Readings check would need a join - keep it simple for onboarding"
```

The `hasReadings` field is always `false` regardless of actual data. This means onboarding status may never show as fully complete.

**Impact:** Incorrect onboarding status display.
**Severity:** LOW

### CR-13: `completeStep` and `markOnboardingComplete` Are No-Ops

**File:** `src/app/actions/onboarding.ts`
**Lines:** 57-67

These server actions do nothing and return hardcoded success. They suggest incomplete implementation.

**Impact:** Onboarding completion is not tracked.
**Severity:** LOW

---

## Security Findings

### SEC-1: Open Redirect in Auth Callback [HIGH]

**File:** `src/app/auth/callback/route.ts`
**Lines:** 4-18

The `next` query parameter is used directly in a redirect without validation:

```typescript
const next = searchParams.get("next") ?? "/dashboard";
// ...
return NextResponse.redirect(`${origin}${next}`);
```

While `origin` is prepended, the `next` parameter can be crafted to redirect to arbitrary external sites via path manipulation (e.g., `//evil.com/path` or `\evil.com`). Should be validated against a whitelist of allowed paths.

**Impact:** Phishing attacks via crafted auth callback URLs.
**Severity:** HIGH

### SEC-2: Login Redirect Parameter Not Validated

**File:** `src/middleware.ts`
**Line:** 65

The middleware redirects unauthenticated users to `/login?redirect={pathname}`. The login page then uses this parameter for post-login redirection without validation. Combined with SEC-1's pattern, this creates an open redirect chain.

**File:** `src/app/(auth)/login/page.tsx`
**Line:** 15

```typescript
const redirect = searchParams.get("redirect") || "/dashboard";
// Used directly in: router.push(redirect);
```

**Impact:** Post-login open redirect.
**Severity:** MEDIUM

### SEC-3: No Content Security Policy (CSP) Header

**File:** `next.config.ts`
**Lines:** 5-37

The security headers configuration includes X-Frame-Options, HSTS, etc., but is missing a Content-Security-Policy header. This leaves the application vulnerable to XSS via injected scripts.

**Impact:** No protection against script injection.
**Severity:** MEDIUM

### SEC-4: No Role-Based Access Control (RBAC) Enforcement

**Files:** All server actions and API routes

The system has a `userRoleEnum` defined in the schema (`'owner' | 'admin' | 'member'`), but no server-side logic ever checks the user's role. All authenticated users within an organization have identical privileges -- including destructive operations like locking/unlocking compliance years, deleting documents, and modifying billing.

For example, a `member` can unlock a compliance year that an `owner` locked:
```typescript
// compliance-workflow.ts: No role check
export async function unlockComplianceYear(buildingId, year, reason) {
  const ctx = await getAuthContext(); // Checks auth only, not role
```

**Impact:** No least-privilege enforcement; any org member has full admin access.
**Severity:** HIGH

### SEC-5: In-Memory Rate Limiter Does Not Scale

**File:** `src/lib/rate-limit.ts`

The rate limiter uses an in-memory `Map`. In a multi-instance deployment (Vercel serverless, Docker replicas), each instance maintains its own independent state. Rate limits are per-instance, not per-user globally.

Additionally, the `setInterval` cleanup is never cleared, potentially preventing garbage collection of the rate limiter module in serverless environments.

**Impact:** Rate limiting is easily bypassed in production deployments.
**Severity:** MEDIUM

### SEC-6: Feature Gate Not Enforced on CSV Import Route

**File:** `src/app/api/buildings/[id]/import/route.ts`

The CSV import route checks authentication and rate limits but does not call `checkAccess(orgId, 'csvUpload')`. A user on the free tier can bypass the feature gate by calling the API directly.

**Impact:** Free-tier users can access paid features.
**Severity:** MEDIUM

### SEC-7: Feature Gate Not Enforced on Report Generation Route

**File:** `src/app/api/reports/[buildingId]/route.ts`

Same issue: the report generation route does not check `checkAccess(orgId, 'reportGeneration')`.

**Impact:** Free-tier users can generate PDF reports.
**Severity:** MEDIUM

### SEC-8: Stripe Webhook Relies on Unsigned Metadata for Org ID

**File:** `src/app/api/webhooks/stripe/route.ts`
**Lines:** 37-39, 77

The webhook handler trusts `session.metadata?.orgId` and `sub.metadata?.orgId` to determine which organization to update. While the webhook signature ensures Stripe sent the event, the metadata was set during checkout session creation. If an attacker can create a checkout session with a different org's ID, they could take over that org's subscription.

The current code at `stripe/client.ts` line 114 sets `metadata: { orgId }` from the authenticated user's org, so this is currently safe. However, the pattern of trusting metadata without verification is fragile.

**Impact:** Theoretical subscription hijacking if checkout session creation is compromised.
**Severity:** LOW

### SEC-9: `isPublicRoute` Prefix Matching May Be Too Permissive

**File:** `src/middleware.ts`
**Lines:** 15-18

```typescript
return PUBLIC_ROUTES.some(
  (route) => pathname === route || pathname.startsWith(route + "/"),
);
```

Routes like `/calculator` will match `/calculator/anything`. Combined with `pathname.includes(".")` (line 28), a request to `/calculator/../../admin.json` could bypass auth on edge cases. This is unlikely to be exploitable in Next.js's routing but represents defense-in-depth weakness.

**Impact:** Theoretical auth bypass.
**Severity:** LOW

### SEC-10: Email Content Not HTML-Escaped in Reminder Emails

**File:** `src/lib/notifications/deadline-reminders.ts`
**Lines:** 105-113, 119

Building names from user input are interpolated directly into HTML email content without escaping:

```typescript
const body = [...].join('\n');
// ...
html: body.replace(/\n/g, '<br/>'), // Building name used unescaped
```

A building named `<script>alert(1)</script>` would inject HTML into the email. Most email clients sanitize this, but it's a stored XSS vector in clients that don't.

**Impact:** Stored XSS in email content.
**Severity:** LOW

---

## Performance Findings

### PERF-1: `recalculateAllBuildings` Is Sequential, Not Parallel

**File:** `src/lib/emissions/compliance-service.ts`
**Lines:** 173-185

```typescript
for (const b of orgBuildings) {
  const r = await calculateBuildingCompliance(b.id, year);
  results.push(r);
}
```

Each building is recalculated sequentially. For a portfolio of 50 buildings, this could take 50x the time of a single calculation. Using `Promise.allSettled` with controlled concurrency would dramatically improve throughput.

**Impact:** Slow portfolio recalculations for larger portfolios.
**Severity:** MEDIUM

### PERF-2: `bulkRecalculate` Is Also Sequential

**File:** `src/app/actions/compliance-workflow.ts`
**Lines:** 209-217

Same sequential pattern as PERF-1.

**Impact:** Slow bulk operations.
**Severity:** MEDIUM

### PERF-3: `syncProperties` N+1 for Property Details

**File:** `src/lib/portfolio-manager/sync.ts`
**Lines:** 38-53

For each property that needs details, a separate HTTP request is made. For accounts with many properties, this creates N+1 external API calls with 1-second rate limiting delays.

**Impact:** Slow PM sync for large portfolios. With 50 properties needing details, sync takes 50+ seconds minimum.
**Severity:** MEDIUM

### PERF-4: CSV Import Processes Rows Sequentially with Individual DB Queries

**File:** `src/lib/inngest/process-csv-import.ts`
**Lines:** 30-114

Each CSV row triggers:
1. A query to find existing utility accounts
2. Potentially an insert for a new account
3. An insert for the reading

For a 1000-row CSV, this is 2000-3000 individual DB queries. Batch inserts would be dramatically faster.

**Impact:** Slow CSV imports for large files.
**Severity:** MEDIUM

### PERF-5: Report Generation Route Makes Many Sequential DB Queries

**File:** `src/app/api/reports/[buildingId]/route.ts`
**Lines:** 33-119

The report generation endpoint makes 7 separate sequential database queries (building, org, compliance year, accounts, readings, deductions, documents, all years). These could be parallelized using `Promise.all` since they are independent.

**Impact:** Unnecessary latency in report generation.
**Severity:** LOW

### PERF-6: `triggerRecalculation` Recalculates All Years

**File:** `src/lib/emissions/recalculation.ts`
**Lines:** 6-25

When a reading is added or modified, `triggerRecalculation` queries ALL readings to find all years, then recalculates compliance for EVERY year. If a building has data for 3 years, modifying a single reading triggers 3 full recalculations. Only the affected year(s) need recalculation.

**Impact:** Unnecessary computation after reading changes.
**Severity:** LOW

---

## Maintainability Findings

### MAINT-1: Confidence Assessment Logic Exists in Three Identical Copies

**Files:**
- `src/lib/emissions/confidence.ts` -- `assessConfidence()` (DB version, lines 10-80), `assessConfidenceFromData()` (lines 82-134)
- `src/lib/emissions/confidence-utils.ts` -- `assessConfidenceFromData()` (lines 13-65)

This is the most severe DRY violation in the codebase. The same assessment algorithm is copy-pasted three times. The `confidence-utils.ts` file was created as a "client-safe" version without server imports, which is legitimate, but the logic in `confidence.ts` `assessConfidenceFromData()` is a verbatim duplicate.

**Impact:** High maintenance burden; bug fixes must be applied in 3 places.
**Severity:** HIGH

### MAINT-2: Unit Conversion Functions Duplicated

**Files:**
- `src/lib/emissions/calculator.ts` (lines 9-57) -- `thermsToKbtu`, `fuelOil2GallonsToKbtu`, etc.
- `src/lib/utils/unit-conversion.ts` (lines 10-88) -- `thermsToKbtu`, `gallonsOilToKbtu`, etc.

The conversion functions exist in two places with slightly different APIs. The `calculator.ts` versions are used in the calculation engine; the `unit-conversion.ts` versions are used in the validation module.

**Impact:** Divergent conversion factors could lead to inconsistent results.
**Severity:** MEDIUM

### MAINT-3: Auth Context Fetching Pattern Repeated Across Files

Multiple files implement their own `getOrgId()` or `getAuthOrgInfo()` functions that replicate the same pattern:

1. `src/lib/auth/helpers.ts` -- `getUserOrgId()`, `getAuthContext()`
2. `src/app/actions/onboarding.ts` -- private `getOrgId()`
3. `src/app/actions/billing.ts` -- private `getAuthOrgInfo()`
4. `src/app/api/billing/route.ts` -- private `getAuthOrgId()`
5. `src/app/(dashboard)/dashboard/page.tsx` -- private `getOrgId()`

The auth helpers module was created to centralize this, but many files still use their own local implementations.

**Impact:** Inconsistent auth handling; changes must be applied in many places.
**Severity:** MEDIUM

### MAINT-4: Magic Strings for Occupancy Types

Occupancy type strings like `'B - Business'` are used as record keys throughout the jurisdiction config and in form validation, but there's no single source of truth enforced at the type level. The `NYC_OCCUPANCY_TYPES` array in `types/index.ts` exists but isn't used as a constraint in the calculation engine.

**Impact:** Typos in occupancy types cause silent failures.
**Severity:** LOW

### MAINT-5: `compliance-service.ts` Is a 250-Line God Module

**File:** `src/lib/emissions/compliance-service.ts`

This file handles:
- Building compliance calculation
- Transaction management for compliance year upsert
- Portfolio recalculation
- Compliance summary with caching

These are distinct responsibilities that should be separated.

**Impact:** Hard to test and reason about individually.
**Severity:** LOW

### MAINT-6: Inconsistent Error Return Patterns in Server Actions

Some server actions return `{ error: string }` on failure, others return `{ error: string, data: [] }`, and others return `null` or empty arrays. There is no standardized result type.

For example:
- `getDeductions()` returns `{ error: 'Unauthorized', data: [] }`
- `createReading()` returns `{ error: 'Unauthorized' }`
- `getPortfolioBuildings()` returns `[]`
- `getAuthContext()` returns `null`

**Impact:** Inconsistent error handling for consumers.
**Severity:** LOW

### MAINT-7: Dead Import / Unused Variables

Minor instances:
- `src/app/api/reports/[buildingId]/route.ts` line 4: `desc` imported from drizzle-orm
- Various files import `sql` but use it inconsistently with parameterized vs template patterns

**Impact:** Code noise.
**Severity:** LOW

---

## Architecture Assessment

### Positive Patterns

1. **Jurisdiction Plugin System:** The `src/lib/jurisdictions/` architecture is exemplary. Adding a new jurisdiction (e.g., Boston BERDO) requires only creating a new config file and registering it. The calculation engine is jurisdiction-agnostic.

2. **Pure Calculation Engine:** `calculator.ts` and `mixed-use.ts` are pure functions with no side effects, making them highly testable. The 53 tests provide good coverage.

3. **Authorization Helpers:** The `assertBuildingAccess()` and `filterAuthorizedBuildingIds()` pattern provides a consistent, centralized authorization mechanism. Every API route and server action uses these helpers.

4. **Inngest for Background Jobs:** Moving CSV imports to Inngest background jobs was the right architectural decision. This prevents request timeouts for large files.

5. **Next.js RSC Usage:** The dashboard page properly uses React Server Components for data fetching and passes serialized data to client components. This is textbook Next.js 16 architecture.

### Architectural Concerns

1. **No Database Migration Files:** The schema is defined in Drizzle, but there are no visible migration files. Schema changes in production would require careful migration management.

2. **No Soft Delete:** Documents, readings, and deductions are hard-deleted. This prevents audit trail and recovery. For a compliance application, this is a significant gap.

3. **No Audit Log for Data Changes:** While `complianceActivities` logs some workflow actions, actual data mutations (reading creates/updates/deletes, document uploads) are not logged to an audit trail. For compliance software, this is a regulatory concern.

4. **Single DB Connection Pool:** The single `postgres` connection pool in `db/index.ts` is shared across all serverless invocations. In Vercel's serverless model, this could lead to connection exhaustion since each cold start creates a new pool.

---

## Findings Summary Table

| ID | Category | Severity | Finding |
|----|----------|----------|---------|
| CR-1 | Correctness | CRITICAL | Building detail page renders hardcoded demo data |
| CR-4 | Correctness | HIGH | Silent fallthrough for unrecognized units in normalizeConsumption |
| CR-5 | Correctness | HIGH | GJ-to-kBtu conversion declared but never applied |
| CR-6 | Correctness | HIGH | deleteReading does not verify reading belongs to building |
| CR-7 | Correctness | HIGH | updateReading does not verify reading ownership |
| SEC-1 | Security | HIGH | Open redirect in auth callback |
| SEC-4 | Security | HIGH | No RBAC enforcement despite role enum in schema |
| MAINT-1 | Maintainability | HIGH | Confidence assessment logic exists in 3 identical copies |
| SEC-2 | Security | MEDIUM | Login redirect parameter not validated |
| SEC-3 | Security | MEDIUM | No Content Security Policy header |
| SEC-5 | Security | MEDIUM | In-memory rate limiter does not scale |
| SEC-6 | Security | MEDIUM | Feature gate not enforced on CSV import |
| SEC-7 | Security | MEDIUM | Feature gate not enforced on report generation |
| CR-2 | Correctness | MEDIUM | Duplicate type definitions for compliance types |
| CR-3 | Correctness | MEDIUM | Triplicated confidence assessment logic |
| CR-8 | Correctness | MEDIUM | deleteDeduction does not verify ownership |
| CR-9 | Correctness | MEDIUM | updateDeduction does not verify ownership |
| CR-10 | Correctness | MEDIUM | deleteDocument does not verify ownership |
| MAINT-2 | Maintainability | MEDIUM | Unit conversion functions duplicated |
| MAINT-3 | Maintainability | MEDIUM | Auth context pattern repeated across files |
| PERF-1 | Performance | MEDIUM | recalculateAllBuildings is sequential |
| PERF-2 | Performance | MEDIUM | bulkRecalculate is sequential |
| PERF-3 | Performance | MEDIUM | syncProperties N+1 API calls |
| PERF-4 | Performance | MEDIUM | CSV import processes rows individually |
| CR-11 | Correctness | LOW | revalidateTag called with extra arguments |
| CR-12 | Correctness | LOW | Onboarding hasReadings always false |
| CR-13 | Correctness | LOW | completeStep and markOnboardingComplete are no-ops |
| SEC-8 | Security | LOW | Stripe webhook trusts metadata for org ID |
| SEC-9 | Security | LOW | Public route matching may be overly permissive |
| SEC-10 | Security | LOW | Email content not HTML-escaped |
| PERF-5 | Performance | LOW | Report generation makes sequential DB queries |
| PERF-6 | Performance | LOW | triggerRecalculation recomputes all years |
| MAINT-4 | Maintainability | LOW | Magic strings for occupancy types |
| MAINT-5 | Maintainability | LOW | compliance-service.ts is a god module |
| MAINT-6 | Maintainability | LOW | Inconsistent error return patterns |
| MAINT-7 | Maintainability | LOW | Dead imports / unused variables |

**Total findings: 36**
- CRITICAL: 1
- HIGH: 8
- MEDIUM: 17
- LOW: 10

---

## Recommendations

### Immediate (P0 -- Fix Before Production)

1. **CR-1:** Replace demo data in `buildings/[id]/page.tsx` with actual database queries using `assertBuildingAccess()`.
2. **SEC-1:** Validate `next` parameter in auth callback against a whitelist of allowed path prefixes (e.g., must start with `/`).
3. **CR-6, CR-7:** Add ownership verification to `updateReading` and `deleteReading` by confirming `reading.buildingId === buildingId` before mutation.
4. **SEC-4:** Implement RBAC checks for sensitive operations (lock/unlock, billing, settings).

### Short-Term (P1 -- Fix Within Sprint)

5. **CR-4, CR-5:** Add explicit validation/error for unrecognized units in `normalizeConsumption()` and implement actual GJ-to-kBtu conversion.
6. **SEC-3:** Add a Content-Security-Policy header to `next.config.ts`.
7. **SEC-6, SEC-7:** Add `checkAccess()` calls to CSV import and report generation routes.
8. **MAINT-1:** Consolidate confidence assessment into a single shared implementation.
9. **CR-8, CR-9, CR-10:** Add ownership verification to all delete/update operations.

### Medium-Term (P2 -- Next Quarter)

10. **SEC-5:** Replace in-memory rate limiter with Redis-backed solution (e.g., Upstash).
11. **PERF-1, PERF-2:** Parallelize building recalculations with controlled concurrency.
12. **PERF-4:** Batch CSV import inserts.
13. **MAINT-2, MAINT-3:** Consolidate duplicated utility functions and auth patterns.
14. Add soft delete for compliance-critical data.
15. Implement proper audit logging for all data mutations.

---

*Report generated by Code Review Agent on 2026-03-07*
