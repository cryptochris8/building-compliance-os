# Developer Guide

## Quick Start

```bash
git clone <repo-url>
cd building-compliance-os
cp .env.example .env.local   # Fill in credentials (see .env.example comments)
npm install
npm run dev                  # http://localhost:3000
```

## Project Structure

```
src/
  app/
    (auth)/              Login, signup pages
    (dashboard)/         Protected app shell (sidebar layout)
      buildings/         Building CRUD + per-building tabs
        [id]/            Overview, Readings, Import, Docs, Compliance, Deductions, Reports
      compliance/        Portfolio-level compliance calendar
      dashboard/         Portfolio overview dashboard
      portfolio/         Reports page
      settings/          Account + Portfolio Manager settings
      onboarding/        First-time user wizard
    (marketing)/         Public: home, pricing, calculator, legal
    actions/             Server Actions (mutations)
    api/                 REST API routes (webhooks, reports, compliance, billing)
  components/
    ui/                  shadcn/ui primitives (Button, Card, Table, etc.)
    compliance/          Domain components (charts, checklists, status display)
    buildings/           Building form, occupancy editor
    readings/            Reading form, chart
    billing/             Upgrade prompts
  lib/
    auth/                Supabase auth helpers, AES-256-GCM encryption
    billing/             Feature gates by subscription tier
    csv/                 CSV parser and header validation
    db/                  Drizzle ORM schema, connection, migrations
    emissions/           Core calculation engine (pure functions + DB service)
    inngest/             Background job definitions (CSV import, PM sync)
    jurisdictions/       Compliance law configs (NYC LL97, Boston BERDO)
    notifications/       Email reminders via Resend
    portfolio-manager/   EPA Portfolio Manager API integration
    reports/             PDF report generation (@react-pdf/renderer)
    stripe/              Stripe client, plan configs, webhook helpers
    supabase/            Supabase client (browser + server)
    utils/               Unit conversion, general utilities
    validation/          Reading validation rules, gap detection
  types/                 Shared TypeScript interfaces
  middleware.ts          Auth middleware (route protection)
```

## Architecture Overview

### Data Flow

```
User Action → Server Action → Zod Validation → Auth Check → DB Transaction → Cache Revalidation
```

### Key Patterns

- **Server Actions** handle all mutations (create/update/delete readings, deductions, etc.)
- **API Routes** are for external integrations only (Stripe webhooks, Inngest, reports, health)
- **Server Components** fetch data and pass to Client Components for interactivity
- **Multi-tenant isolation** via `organizationId` on all data, enforced by `assertBuildingAccess()`
- **RBAC** with `WRITE_ROLES` (owner/admin) for mutations, any member for reads

### Emissions Calculation

The calculation engine has two layers:
1. **Pure functions** in `lib/emissions/calculator.ts` — no DB dependency, fully testable
2. **DB service** in `lib/emissions/compliance-service.ts` — reads data, calls calculator, persists results

```
calculateBuildingEmissions() → per-fuel emissions using jurisdiction coefficients
calculateEmissionsLimit()    → limit based on occupancy type + gross sqft
calculatePenalty()           → $ penalty for emissions over limit
calculateComplianceStatus()  → compliant / at_risk / over_limit / incomplete
```

### Adding a New Jurisdiction

1. Create `src/lib/jurisdictions/<name>.ts` (see `nyc-ll97.ts` for reference)
2. Define `JurisdictionConfig` with coefficients, limits per occupancy type, and penalty
3. Register in `src/lib/jurisdictions/index.ts`
4. Add occupancy types to UI dropdowns in building form

### Adding a New API Endpoint

1. Create route file at `src/app/api/<path>/route.ts`
2. Add auth check via `assertBuildingAccess()` or `getAuthContext()`
3. Add rate limiting via `apiLimiter.check(limit, key)`
4. Validate input with Zod schema
5. Return generic error messages (don't leak internals)

### Adding a New Server Action

1. Add to existing action file or create new one in `src/app/actions/`
2. Mark with `'use server'` at top of file
3. Check auth: `getAuthUser()` for reads, `assertBuildingAccess(buildingId, WRITE_ROLES)` for writes
4. Validate with Zod: `schema.safeParse(data)`
5. Return `{ success: true, data }` or `{ error: 'message' }`
6. Call `revalidatePath()` / `revalidateTag()` after mutations

## Running Tests

```bash
npm test              # Run all tests
npm run test:coverage # Run with coverage report
```

Tests are in `__tests__/` directories next to the code they test. Coverage thresholds are enforced in `vitest.config.ts`.

## Environment Variables

See `.env.example` for a complete list with descriptions. Key services:
- **Supabase** — Auth + database
- **Stripe** — Billing
- **Inngest** — Background jobs
- **Sentry** — Error tracking
- **Resend** — Transactional email
- **Upstash Redis** — Rate limiting (optional, in-memory fallback in dev)
