# Architectural Review: Building Compliance OS

**Date:** 2026-03-07
**Reviewer:** Architect Agent (Claude Opus 4.6)
**Codebase:** D:\building-compliance-os
**Overall Grade: B-**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Component Boundaries & Interfaces](#3-component-boundaries--interfaces)
4. [Data Model & Database Architecture](#4-data-model--database-architecture)
5. [API Architecture](#5-api-architecture)
6. [Security Architecture](#6-security-architecture)
7. [Performance Architecture](#7-performance-architecture)
8. [Scalability Considerations](#8-scalability-considerations)
9. [Observability & Reliability](#9-observability--reliability)
10. [Risk Assessment](#10-risk-assessment)
11. [Recommendations Summary](#11-recommendations-summary)

---

## 1. Executive Summary

Building Compliance OS is a Next.js 16 SaaS application for NYC Local Law 97 building emissions compliance tracking. The architecture is a well-structured Next.js monolith leveraging the App Router with React Server Components, Server Actions, and a direct Drizzle ORM connection to Supabase Postgres. Background processing is handled by Inngest, billing by Stripe, and email by Resend.

### Strengths
- **Excellent domain modeling**: The emissions calculation engine (`src/lib/emissions/calculator.ts`) is pure, testable, and well-separated from I/O
- **Plugin-style jurisdiction system**: `src/lib/jurisdictions/` provides clean extensibility for future compliance regimes
- **Consistent authorization**: Centralized `assertBuildingAccess()` / `filterAuthorizedBuildingIds()` in `src/lib/auth/helpers.ts`
- **Modern framework usage**: Proper RSC/Client Component split, App Router route groups, and Server Actions
- **Type safety**: Strict TypeScript, Zod validation on mutations, Drizzle typed schema

### Weaknesses
- **Single-tier monolith with no clear domain layer**: Business logic is scattered across Server Actions and compliance-service
- **Hardcoded demo data in production pages**: Building detail page uses `DEMO_BUILDING` constant instead of real data
- **No service layer abstraction**: Direct DB access in actions and route handlers creates tight coupling
- **In-memory rate limiting**: Will not work across multiple server instances
- **Missing RBAC enforcement**: Role column exists but is never checked
- **Significant code duplication**: Auth context fetching, confidence assessment functions duplicated across files

---

## 2. Architecture Overview

### Pattern: Monolithic Next.js Application
```
                    +------------------+
                    |   CDN / Edge     |
                    |   (Middleware)   |
                    +--------+---------+
                             |
                    +--------v---------+
                    |   Next.js App    |
                    |                  |
                    | +-- Pages (RSC) -+------> Supabase Auth (JWT)
                    | |                |
                    | +-- Server       |
                    | |  Actions       +------> Supabase Postgres
                    | |                |         (via Drizzle ORM)
                    | +-- API Routes --+
                    | |                |
                    | +-- Inngest     -+------> Background Jobs
                    |    Functions     |
                    +--------+---------+
                             |
              +--------------+---------------+
              |              |               |
        +-----v----+  +-----v-----+  +------v------+
        |  Stripe   |  |  Resend   |  | Portfolio   |
        | (Billing) |  |  (Email)  |  | Manager API |
        +-----------+  +-----------+  +-------------+
```

### Layer Decomposition

| Layer | Technology | Location |
|-------|-----------|----------|
| Presentation | React 19, shadcn/ui, Recharts | `src/app/`, `src/components/` |
| Edge Gateway | Next.js Middleware + Supabase SSR | `src/middleware.ts` |
| Server Actions | Next.js `'use server'` | `src/app/actions/` |
| API Routes | Next.js Route Handlers | `src/app/api/` |
| Domain Logic | Pure TypeScript functions | `src/lib/emissions/`, `src/lib/jurisdictions/` |
| Data Access | Drizzle ORM | `src/lib/db/` |
| Infrastructure | Inngest, Resend, Stripe, Sentry | `src/lib/inngest/`, `src/lib/stripe/`, etc. |

### Architectural Style Assessment

The application follows a **Layered Monolith** pattern, though the layers are not explicitly enforced. There is no dependency inversion - Server Actions directly import Drizzle queries, which is pragmatic for an MVP but will cause friction as the codebase grows.

**Verdict: Appropriate for current scale (MVP/early-stage), but needs layer formalization before growth.**

---

## 3. Component Boundaries & Interfaces

### 3.1 Route Group Organization (Good)

```
src/app/
  (auth)/        -- Login/Signup (unauthenticated)
  (dashboard)/   -- Authenticated app shell
  (marketing)/   -- Public marketing pages
  api/           -- REST endpoints
  actions/       -- Server Actions
```

This is textbook Next.js App Router organization. The route groups cleanly separate authenticated vs public vs marketing flows with distinct layouts.

### 3.2 Server Actions Layer (Mixed)

**Location:** `src/app/actions/`

Server Actions handle: `billing.ts`, `compliance.ts`, `compliance-workflow.ts`, `deductions.ts`, `documents.ts`, `onboarding.ts`, `portfolio-manager.ts`, `readings.ts`, `reports.ts`, `utility-accounts.ts`

**Positive patterns:**
- Every mutation validates auth via `assertBuildingAccess()` or `getUserOrgId()`
- Zod schemas validate input before database writes
- Consistent `{ data?, error? }` return pattern
- Locked compliance year checks prevent data corruption

**Issues:**

1. **Auth context is fetched redundantly.** Many actions call both `getAuthUser()` and then `assertBuildingAccess()`, which internally calls `getAuthContext()` again. This means 2-3 Supabase auth roundtrips per action.
   - Severity: **Medium** (latency impact)
   - Example: `createReading()` calls `getAuthUser()` then `assertBuildingAccess()` which internally fetches auth again

2. **No service/use-case layer.** Actions directly import `db` and run queries. If business logic needs to be reused (e.g., from an API route AND a Server Action), it must be duplicated or extracted ad-hoc.
   - Severity: **Medium** (maintainability)

3. **No RBAC.** The `users.role` column (`owner`, `admin`, `member`) is never checked. Any authenticated member can lock/unlock compliance years, delete data, or change billing. This is a significant authorization gap.
   - Severity: **High**

### 3.3 Domain Logic Layer (Excellent)

The emissions calculation engine is the strongest part of the architecture:

- **`calculator.ts`** - Pure functions: `calculateBuildingEmissions()`, `calculateEmissionsLimit()`, `calculatePenalty()`, `detectMissingMonths()`, `calculateCompliance()`. No side effects, no I/O.
- **`mixed-use.ts`** - Weighted limit calculations for multi-occupancy buildings
- **`jurisdictions/`** - Plugin registry pattern with `getJurisdiction()` lookup. Adding a new city (e.g., Boston BERDO) requires only adding a config file.
- **`confidence.ts`** / **`confidence-utils.ts`** - Data quality assessment

**Issue: Code duplication.** `assessConfidenceFromData()` is identically implemented in both `confidence.ts` and `confidence-utils.ts`. The latter exists to be client-safe, but the function body is copy-pasted.
- Severity: **Low**

### 3.4 Client Components (Good)

Components are properly split between RSC (data-fetching) and Client Components (interactive). The dashboard layout uses `"use client"` for navigation state. Individual pages like `DashboardPage` are server-side data-fetching RSCs that pass serialized props to client components like `PortfolioDashboardClient`.

**Issue:** The `DashboardLayout` in `src/app/(dashboard)/layout.tsx` is a client component (`"use client"`). This means the entire dashboard shell (sidebar, navigation, logout) is shipped as a client bundle. While necessary for `useState`/`usePathname`, a pattern of extracting the sidebar into a smaller client island would reduce client JS.
- Severity: **Low**

---

## 4. Data Model & Database Architecture

### 4.1 Schema Design

```
organizations (1) ---< users (N)
     |
     +---< buildings (N) ---< utility_accounts (N) ---< utility_readings (N)
     |         |
     |         +---< compliance_years (N) ---< deductions (N)
     |         |         |
     |         |         +---< compliance_activities (N)
     |         |         +---< documents (N)
     |         |
     |         +---< documents (N)
     |
     +---< pm_connections (1)
     +---< pm_property_mappings (N)
     +---< subscriptions (1)
     +---< import_jobs (N)
```

**Assessment: Well-normalized, appropriate for the domain.**

### 4.2 Schema Strengths

1. **Proper foreign keys** on all relationships with referential integrity
2. **Unique constraints** where needed (e.g., `unique_reading` on account+period, `unique_compliance_year` on building+year)
3. **Indexes** on all foreign key columns (11 indexes total) - good for JOIN performance
4. **Occupancy mix** stored as `jsonb` for flexible multi-use buildings - smart use of structured JSON
5. **Compliance year locking** with `locked`, `lockedAt`, `lockedBy`, `lockReason` - excellent audit trail
6. **Checklist state** as `jsonb` - flexible for evolving compliance workflows

### 4.3 Schema Issues

1. **`numeric` columns stored as strings in TypeScript.** Drizzle maps Postgres `numeric` to JavaScript strings. The codebase constantly converts with `Number()` and `String()`. This is correct for precision preservation but creates conversion noise. Consider using `real`/`double precision` for non-financial values (emissions) and keeping `numeric` only for financial amounts (penalties, costs).
   - Severity: **Low** (correctness ok, ergonomics poor)

2. **No `updated_at` trigger.** The `updatedAt` column on `buildings` and `complianceYears` is set manually in application code. A Postgres trigger would be more reliable.
   - Severity: **Low**

3. **Missing soft-delete.** No `deleted_at` columns on any table. Cascading deletes could destroy audit history. For a compliance SaaS where regulatory data retention matters, this is a gap.
   - Severity: **Medium**

4. **No audit/history table.** While `complianceActivities` provides activity logging, there is no proper audit trail for data changes (what changed, from what value, to what value). For a compliance product, regulatory auditors may require a complete change log.
   - Severity: **Medium**

5. **`grossSqft` is `numeric` but `yearBuilt` is `integer`.** This is correct but note that the `occupancyMix` JSON stores `sqft` as a number - no schema validation that the JSON structure matches expectations. A check constraint or stricter JSON schema would help.
   - Severity: **Low**

6. **`subscriptions` table allows multiple per org.** There is no unique constraint on `orgId`, meaning an org could theoretically have multiple subscription records. The webhook handler uses `insert` on `checkout.session.completed` rather than `upsert`.
   - Severity: **Medium** (data integrity risk)

### 4.4 Migration Strategy

Drizzle Kit is configured (`drizzle.config.ts`) with output to `src/lib/db/migrations`. However, no migration files are present in the repository, suggesting the schema is being pushed directly or migrations are not committed. This is a deployment risk.
- Severity: **Medium**

---

## 5. API Architecture

### 5.1 Dual API Surface

The application exposes two API surfaces:

1. **Server Actions** (`src/app/actions/`) - Primary mutation interface for the UI. 10 files covering all domain operations.
2. **Route Handlers** (`src/app/api/`) - For operations requiring HTTP semantics (PDF generation, CSV import, webhooks, Inngest).

This is a reasonable split. Server Actions for form-like mutations, Route Handlers for file I/O and webhooks.

### 5.2 API Route Inventory

| Route | Method | Purpose | Auth | Rate Limited |
|-------|--------|---------|------|-------------|
| `/api/billing` | GET/POST | Subscription management | Yes | Yes (5/min) |
| `/api/buildings/[id]/import` | POST | CSV file upload | Yes | Yes (5/min) |
| `/api/compliance/[buildingId]` | GET/POST | Compliance data / recalc | Yes | No |
| `/api/compliance/portfolio` | GET | Portfolio summary | Yes | No |
| `/api/import-jobs/[id]` | GET | Import job status | Yes | No |
| `/api/inngest` | POST | Inngest webhook | Inngest SDK | No |
| `/api/reports/[buildingId]` | GET | PDF report generation | Yes | Yes (10/min) |
| `/api/reports/bulk` | POST | Bulk report generation | Yes | No |
| `/api/webhooks/stripe` | POST | Stripe webhooks | Stripe sig | Yes (100/min) |

### 5.3 Issues

1. **No API versioning.** Routes are unversioned (`/api/reports/` not `/api/v1/reports/`). Not critical for a UI-first app, but if API consumers emerge, breaking changes will be hard to manage.
   - Severity: **Low**

2. **Inconsistent rate limiting.** Report generation and billing are rate-limited, but compliance calculation and portfolio endpoints are not. A single user could trigger unlimited recalculations.
   - Severity: **Medium**

3. **No pagination on compliance activities.** `getComplianceActivities()` returns ALL activities for a building with no limit. For buildings with years of history, this will grow unbounded.
   - Severity: **Medium**

4. **Missing CSP header.** The `next.config.ts` sets 6 security headers but omits Content-Security-Policy. For a SaaS handling financial/compliance data, CSP is important.
   - Severity: **Medium**

5. **Bulk report generation has no concurrency control.** The `/api/reports/bulk` route generates PDFs synchronously for each building. For a portfolio of 50 buildings, this could timeout.
   - Severity: **High**

---

## 6. Security Architecture

### 6.1 Authentication

Authentication is handled by Supabase Auth with:
- **Middleware** (`src/middleware.ts`): Checks auth on all non-public routes, redirects to `/login` with `redirect` param
- **Server-side auth**: `createClient()` from `@supabase/ssr` for cookie-based sessions
- **Client-side auth**: `createBrowserClient()` for browser auth operations (logout)

**Issue: JWT vs session ambiguity.** The middleware creates a fresh Supabase client on every request and calls `supabase.auth.getUser()` which validates the JWT with Supabase's servers. This adds latency to every authenticated request. Consider caching the user object or using `getSession()` for non-sensitive routes.
- Severity: **Low** (Supabase best practice is indeed `getUser()` for security)

### 6.2 Authorization

**Multi-tenancy enforcement:** Organization-scoped access is enforced at the application layer:
- `assertBuildingAccess(buildingId)` - Verifies building belongs to user's org
- `filterAuthorizedBuildingIds(ids)` - Filters batch operations to authorized IDs
- `getUserOrgId()` - Returns current user's org for list queries

**Critical Gap: No Row-Level Security (RLS).** Supabase supports Postgres RLS policies, but they are not used. All authorization is in the application layer. If any code path bypasses the helper functions, data leaks. Since the DB connection uses `postgres` directly (not through Supabase client with RLS), a single missed auth check equals a data breach.
- Severity: **High**

**Critical Gap: No RBAC.** The `role` column (`owner`, `admin`, `member`) exists on `users` but is never checked. Any authenticated org member can:
- Lock/unlock compliance years
- Delete documents
- Change billing
- Connect Portfolio Manager credentials
- Import data
- Modify deductions

This means a `member` role has the same privileges as an `owner`. For enterprise customers, this is unacceptable.
- Severity: **High**

### 6.3 Encryption

Portfolio Manager credentials are encrypted at rest using AES-256-GCM (`src/lib/auth/encryption.ts`). The implementation is correct:
- 12-byte random IV per encryption
- Auth tag for integrity verification
- Key from environment variable (64 hex chars)
- Format: `iv:ciphertext:authTag`

This is a solid implementation.

### 6.4 Webhook Security

Stripe webhooks properly verify signatures using `stripe.webhooks.constructEvent()`. The webhook secret comes from `STRIPE_WEBHOOK_SECRET` env var. The Inngest route uses the Inngest SDK's built-in verification.

### 6.5 Input Validation

Zod schemas are used for mutation inputs:
- `readingFormSchema` - Readings with type-safe units and ranges
- `documentFormSchema` - Document uploads with 10MB limit
- `deductionFormSchema` - Deductions with positive amount check

**Issue:** Not all mutations use Zod validation. `updateChecklist()`, `addComplianceNote()`, and `lockComplianceYear()` accept unvalidated string inputs.
- Severity: **Low** (these are authenticated admin operations)

---

## 7. Performance Architecture

### 7.1 Database Query Patterns

**Optimized patterns (post-audit fixes):**
- Portfolio summary uses `LEFT JOIN` instead of N+1 queries
- Deadline reminders batch-fetch compliance years with `inArray`
- Bulk operations pre-fetch locked years before iterating

**Remaining issues:**

1. **Sequential building recalculation.** `recalculateAllBuildings()` processes buildings sequentially in a `for` loop. For 50 buildings, each requiring multiple DB queries, this could take 30+ seconds.
   - Severity: **Medium**

2. **No database connection pooling for serverless.** The Postgres connection is created at module level with `max: 10`. In a serverless environment (Vercel), each function invocation may create a new pool. Supabase Transaction Mode or pgbouncer should be used.
   - Severity: **High** (production deployment risk)

3. **PDF generation in-process.** Report generation renders React components to PDF buffers in the API route handler. This is CPU-intensive and blocks the Node.js event loop. For a SaaS, this should be offloaded to a background job (Inngest already available).
   - Severity: **Medium**

### 7.2 Caching Strategy

```
Next.js unstable_cache (5 min TTL)
  └── Portfolio summary: keyed by orgId + year
      └── Revalidated via tags: 'portfolio-summary-{orgId}-{year}'
```

The caching strategy is minimal but appropriate:
- `getComplianceSummary()` uses `unstable_cache` with 5-minute revalidation and tag-based invalidation
- Individual mutations call `revalidateTag()` and `revalidatePath()` to invalidate caches

**Issues:**
1. `unstable_cache` is still marked experimental in Next.js. Consider migrating to the stable `cache()` API or implementing Redis-based caching for production.
   - Severity: **Low**

2. No caching on building detail queries, compliance data, or reading lists. Every page load hits the database directly.
   - Severity: **Low** (acceptable for current scale)

### 7.3 Rate Limiting

In-memory sliding window rate limiter (`src/lib/rate-limit.ts`):
- `apiLimiter`: 60s window, 500 unique tokens
- `authLimiter`: 15m window, 500 unique tokens
- `webhookLimiter`: 60s window, 100 unique tokens

**Critical Issue: In-memory rate limiter is per-process.** In any deployment with more than one server instance (Vercel serverless, multi-pod K8s), each instance has its own rate limit state. An attacker can bypass limits by hitting different instances. Must use Redis or similar distributed store.
- Severity: **High** (for production deployment)

---

## 8. Scalability Considerations

### 8.1 Current Scale Assessment

The architecture is appropriate for:
- **Buildings:** 1-500 buildings per org, 1-100 organizations
- **Readings:** Up to ~100K utility readings total
- **Users:** Low hundreds of concurrent users
- **Reports:** Occasional PDF generation

### 8.2 Scaling Bottlenecks

| Bottleneck | Current State | At Scale Impact | Mitigation |
|-----------|--------------|----------------|-----------|
| Single Postgres DB | Direct connection, max 10 | Connection exhaustion at scale | Connection pooler (PgBouncer/Supabase Transaction Mode) |
| In-memory rate limit | Per-process state | Bypass in multi-instance | Redis-based rate limiter |
| Sequential recalculation | For loop over buildings | Minutes for large portfolios | Parallel processing via Inngest fan-out |
| PDF in API route | Blocks event loop | Request timeouts | Offload to Inngest background job |
| No read replicas | Single DB for reads/writes | Bottleneck under read load | Supabase read replica or caching layer |
| Full table scans on activities | No pagination, no time bounds | Slow as data grows | Add pagination + time-range filters |

### 8.3 Multi-Tenancy Architecture

The multi-tenancy model is **shared schema, shared database** with application-level tenant isolation via `organizationId` foreign keys. This is appropriate for early-stage SaaS but creates a ceiling:

- **Data isolation**: Application-layer only (no RLS). One bug = cross-tenant data access.
- **Noisy neighbor**: Large portfolios can slow queries for all tenants.
- **Compliance requirements**: Some enterprise customers may require data isolation guarantees.

For the target market (building owners/managers in NYC), this model is fine for the first 1-2 years.

### 8.4 Horizontal Scaling Readiness

| Aspect | Ready? | Notes |
|--------|--------|-------|
| Stateless server | Mostly | In-memory rate limiter breaks this |
| Session management | Yes | Cookie-based via Supabase Auth |
| Background jobs | Yes | Inngest handles scaling automatically |
| Database | Partially | Connection pooling needed |
| File storage | Yes | Supabase Storage (S3-backed) |
| Email delivery | Yes | Resend handles scaling |
| Billing | Yes | Stripe handles scaling |

---

## 9. Observability & Reliability

### 9.1 Error Monitoring

Sentry is configured for client, server, and edge runtimes:
- `sentry.client.config.ts` - 10% traces in prod, 100% error replays
- `sentry.server.config.ts` / `sentry.edge.config.ts`
- `src/instrumentation.ts` - Request error capturing
- `src/app/global-error.tsx` - Error boundary

This is a solid observability foundation.

### 9.2 Logging

Currently uses `console.error` for error logging and `console.log` for PM sync progress. No structured logging, no log levels, no correlation IDs.
- Severity: **Medium** (for production debugging)

### 9.3 Health Checks

No health check endpoint exists. Standard practice is to have `/api/health` that checks DB connectivity.
- Severity: **Low**

### 9.4 Testing

- 53 unit tests in `src/lib/emissions/__tests__/` covering `calculator.ts` and `mixed-use.ts`
- Tests are pure function tests (no DB, no mocking needed)
- No integration tests, no API route tests, no component tests

**Test coverage is concentrated on the calculation engine (the most critical path), which is the right priority for an MVP.** However, Server Actions handling auth and DB operations have zero test coverage.
- Severity: **Medium**

### 9.5 CI/CD

`.github/workflows/ci.yml`:
- TypeScript type check (`tsc --noEmit`)
- ESLint
- Vitest

No deployment pipeline, no staging environment, no database migration step in CI.
- Severity: **Medium**

---

## 10. Risk Assessment

### Critical Risks (P0)

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|-----------|-----------|
| 1 | **No RBAC enforcement** | Any org member can perform destructive admin actions | High | Implement role checks in auth helpers |
| 2 | **No RLS in Supabase** | Application-layer auth bypass = cross-tenant data leak | Medium | Enable Postgres RLS policies as defense-in-depth |
| 3 | **In-memory rate limiter** | Rate limiting ineffective in production (serverless) | High | Replace with Redis/Upstash rate limiter |

### High Risks (P1)

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|-----------|-----------|
| 4 | **Connection pool exhaustion in serverless** | DB connection errors under moderate load | High | Use Supabase connection pooler/Transaction Mode |
| 5 | **PDF generation blocks event loop** | API timeouts for report generation | Medium | Move to Inngest background job |
| 6 | **Hardcoded demo data on building detail page** | Building detail shows fake data instead of real DB data | High | Replace DEMO_BUILDING with actual DB query |
| 7 | **No soft-delete for compliance data** | Regulatory data loss from accidental deletes | Medium | Add soft-delete pattern |
| 8 | **Bulk report generation can timeout** | Portfolio-wide reports fail for large portfolios | Medium | Fan-out via Inngest |

### Medium Risks (P2)

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|-----------|-----------|
| 9 | Duplicate subscription records | Billing inconsistencies | Low | Add unique constraint on subscriptions.orgId |
| 10 | No migration files committed | Deployment failures | Medium | Commit and version Drizzle migrations |
| 11 | No structured logging | Slow incident response | Medium | Implement structured logging (pino/winston) |
| 12 | Unbounded compliance activities query | Memory issues for old buildings | Low | Add pagination |
| 13 | Sequential recalculation | Slow portfolio operations | Medium | Parallel/fan-out via Inngest |
| 14 | Missing CSP header | XSS risk surface | Low | Add Content-Security-Policy |
| 15 | Auth context fetched redundantly | Unnecessary latency per mutation | Medium | Thread auth context through function calls |

---

## 11. Recommendations Summary

### Immediate (Before Production)

1. **Implement RBAC checks** - Add a `requireRole('owner' | 'admin')` helper and apply to destructive operations (lock/unlock, billing, PM credentials, delete operations)
2. **Enable Supabase RLS** - Add row-level security policies as defense-in-depth, even with application-layer auth
3. **Replace in-memory rate limiter** - Use Upstash Redis or `@upstash/ratelimit` for distributed rate limiting
4. **Fix building detail page** - Replace `DEMO_BUILDING` with real database query
5. **Configure connection pooling** - Use Supabase's pooler URL for the `DATABASE_URL`

### Short-Term (Sprint 1-2)

6. **Extract a service layer** - Create `src/lib/services/` with use-case functions that encapsulate auth + business logic + persistence. Server Actions become thin wrappers.
7. **Move PDF generation to Inngest** - Create a background job that generates PDFs and stores them in Supabase Storage, then notifies the user.
8. **Add structured logging** - Replace `console.error` calls with a proper logger (pino) that includes correlation IDs.
9. **Commit Drizzle migrations** - Generate and commit migration files, add migration step to CI.
10. **Add soft-delete** - Add `deletedAt` columns to `buildings`, `utilityReadings`, `complianceYears`, `documents`.

### Medium-Term (Next Quarter)

11. **Add integration tests** - Test Server Actions with a test database. Focus on auth, RBAC, and data integrity.
12. **Implement proper audit logging** - Create a `change_log` table that records who changed what, from what value, to what value. Essential for compliance SaaS.
13. **Add API pagination** - Compliance activities, readings lists, building lists should all support cursor-based pagination.
14. **Consider CQRS** - Separate read models (dashboard summaries, portfolio views) from write models (mutations). Cache read models aggressively.
15. **Evaluate read replicas** - As traffic grows, route read queries to Supabase read replicas.

### Architecture Decision Records Needed

1. **ADR-001:** Multi-tenancy strategy (shared schema vs schema-per-tenant)
2. **ADR-002:** Background job strategy (Inngest vs Supabase Edge Functions)
3. **ADR-003:** File storage strategy (Supabase Storage vs S3 direct)
4. **ADR-004:** Rate limiting strategy (distributed vs per-route)
5. **ADR-005:** Audit logging requirements for regulatory compliance

---

## Appendix A: File Inventory Summary

| Category | Count | Key Files |
|----------|-------|-----------|
| Schema Files | 3 | `schema/index.ts`, `schema/pm.ts`, `schema/subscriptions.ts` |
| Server Actions | 10 | `actions/compliance.ts`, `actions/readings.ts`, etc. |
| API Routes | 9 | `api/reports/`, `api/billing/`, `api/webhooks/stripe/` |
| Domain Logic | 8 | `emissions/calculator.ts`, `jurisdictions/nyc-ll97.ts`, etc. |
| Auth/Security | 4 | `auth/helpers.ts`, `auth/encryption.ts`, `rate-limit.ts`, `middleware.ts` |
| Infrastructure | 5 | `inngest/`, `stripe/`, `supabase/`, `reports/`, `notifications/` |
| Validation | 3 | `validation/reading-validator.ts`, `validation/gap-detector.ts`, `csv/parser.ts` |
| UI Components | ~30 | `components/compliance/`, `components/buildings/`, `components/ui/` |
| Tests | 2 | `emissions/__tests__/calculator.test.ts`, `mixed-use.test.ts` |

## Appendix B: Dependency Assessment

| Dependency | Version | Risk | Notes |
|-----------|---------|------|-------|
| next | 16.1.6 | Low | Latest stable, good |
| react | 19.2.3 | Low | Latest stable |
| drizzle-orm | 0.45.1 | Low | Mature, well-maintained |
| @supabase/ssr | 0.9.0 | Low | Official SSR package |
| inngest | 3.52.5 | Low | Mature background job platform |
| stripe | 20.4.0 | Low | Latest major version |
| zod | 4.3.6 | Low | v4 is latest stable |
| @sentry/nextjs | 10.42.0 | Low | Latest major |
| @react-pdf/renderer | 4.3.2 | Medium | CPU-intensive, should be backgrounded |

No vulnerable or deprecated dependencies detected. All major dependencies are on latest stable versions.

---

*End of Architectural Review*
