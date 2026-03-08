# Testing/QA Audit Report - Building Compliance OS

**Audit Date:** 2026-03-07
**Auditor:** Testing/QA Agent (Sonnet 4.5)
**Codebase:** Building Compliance OS - Next.js 16 SaaS (NYC LL97 Emissions Compliance)

---

## Executive Summary

**Overall Grade: D+**

The Building Compliance OS codebase has recently added 53 unit tests for core calculation logic (`calculator.ts` and `mixed-use.ts`), representing a positive step toward quality assurance. However, this represents **less than 5% actual test coverage** of the application. The test suite covers only the pure calculation engine while leaving untested:
- All API routes (9 routes, 0 tests)
- All database operations and ORM queries
- All React components (60+ components, 0 tests)
- All authentication/authorization logic
- All third-party integrations (Stripe, Supabase, Inngest, Portfolio Manager API)
- All critical business logic (CSV parsing, validation, encryption, rate limiting)

The absence of integration tests, E2E tests, API tests, and component tests creates significant quality risk for a compliance-critical SaaS application handling financial penalties.

---

## Test Infrastructure Assessment

### Current Setup

#### ✅ Strengths
1. **Vitest configured correctly** - Modern, fast test runner with good Next.js support
2. **Path aliases working** - `@/` alias properly configured in `vitest.config.ts`
3. **TypeScript support** - Tests are written in TypeScript with full type checking
4. **CI integration** - GitHub Actions workflow runs tests on every push/PR
5. **Test scripts** - `npm test` (run) and `npm test:watch` (watch mode) available

#### ❌ Weaknesses
1. **No coverage collection configured** - Coverage tooling (`@vitest/coverage-v8`) not installed
2. **No coverage thresholds** - No minimum coverage requirements enforced
3. **No E2E framework** - No Playwright, Cypress, or similar for end-to-end tests
4. **No component testing** - No `@testing-library/react` or similar for React component tests
5. **No API testing** - No supertest, MSW, or similar for API route testing
6. **No test data factories** - Tests create data inline, leading to duplication
7. **No test database** - Tests don't interact with database layer at all

### Configuration Review

**vitest.config.ts:**
```typescript
test: {
  globals: true,         // ✅ Good - allows describe/it without imports
  environment: 'node',   // ⚠️ Limits to Node-only tests (no DOM/React testing)
}
```

**Missing configurations:**
- No coverage configuration
- No setupFiles for test environment initialization
- No mocks directory structure
- No test timeout configuration
- No parallel execution tuning

**CI/CD (`.github/workflows/ci.yml`):**
- ✅ Tests run on every push to master
- ✅ Tests run on all PRs
- ❌ No coverage reporting
- ❌ No test result artifacts
- ❌ No performance regression testing
- ❌ No visual regression testing

---

## Test Coverage Analysis

### Tested Code (2 files, 53 tests)

#### ✅ `src/lib/emissions/calculator.ts` (44 tests)
**Coverage: ~95% (estimated from test cases)**

**Well-tested functions:**
- ✅ `thermsToKbtu`, `fuelOil2GallonsToKbtu`, `fuelOil4GallonsToKbtu`, `districtSteamMlbToKbtu` - Unit conversions
- ✅ `normalizeConsumption` - All utility types and unit combinations
- ✅ `calculateBuildingEmissions` - Multiple fuel types, year filtering, monthly breakdown
- ✅ `calculateEmissionsLimit` - Multiple occupancy types, multiple compliance periods
- ✅ `calculatePenalty` - Over/under limit scenarios
- ✅ `calculateComplianceStatus` - All 4 status types
- ✅ `detectMissingMonths` - Empty, partial, full year coverage
- ✅ `calculateCompliance` - Full integration of all functions

**Test quality:**
- ✅ **Good:** Comprehensive edge cases (empty data, other years, multi-month periods)
- ✅ **Good:** Numeric precision testing with `toBeCloseTo()` for floating point
- ✅ **Good:** Both happy path and error cases (unknown jurisdiction, unknown occupancy)
- ✅ **Good:** Boundary testing (exactly at limit, 90% threshold for at_risk)
- ✅ **Good:** Test data helpers (`makeFullYearReadings()`) for DRY tests

**Minor gaps:**
- ⚠️ No negative value tests for unit conversions
- ⚠️ No tests for extreme values (very large buildings, very high consumption)
- ⚠️ No performance tests for large reading sets (1000+ readings)

#### ✅ `src/lib/emissions/mixed-use.ts` (9 tests)
**Coverage: ~90%**

**Well-tested functions:**
- ✅ `calculateMixedUseLimit` - Single/multiple occupancy types, period differences
- ✅ `validateOccupancyMix` - Match/mismatch scenarios, custom tolerance

**Test quality:**
- ✅ **Good:** Error handling (invalid occupancy, unknown jurisdiction)
- ✅ **Good:** Edge cases (single type, tolerance boundary)
- ✅ **Good:** Numeric rounding validation

---

### Untested Code (Critical Gaps)

#### 🔴 P0: Zero Test Coverage - Security-Critical Code

##### 1. Authentication & Authorization (`src/lib/auth/helpers.ts`) - **0 tests**
**Lines of code:** 90
**Risk:** CRITICAL - Controls access to all building data and financial information

**Untested functions:**
```typescript
- getAuthUser()                        // No tests for auth failure scenarios
- getUserOrgId()                       // No tests for missing org
- requireAuth()                        // No tests for unauthorized access
- getAuthContext()                     // No tests for null user/org
- assertBuildingAccess(buildingId)     // ⚠️ IDOR protection, zero tests
- filterAuthorizedBuildingIds(ids)    // ⚠️ Bulk access control, zero tests
```

**Critical test gaps:**
- ❌ No tests for IDOR scenarios (user A accessing building owned by org B)
- ❌ No tests for SQL injection in building ID filtering
- ❌ No tests for session expiration handling
- ❌ No tests for concurrent auth state changes
- ❌ No tests for Supabase auth errors

**Impact:** A bug in `assertBuildingAccess()` could expose all buildings across all organizations.

##### 2. Encryption (`src/lib/auth/encryption.ts`) - **0 tests**
**Lines of code:** 57
**Risk:** CRITICAL - Encrypts Portfolio Manager passwords in database

**Untested functions:**
```typescript
- encrypt(plaintext)     // No tests for encryption correctness
- decrypt(encrypted)     // No tests for decryption correctness
- getEncryptionKey()     // No tests for missing/invalid key
```

**Critical test gaps:**
- ❌ No tests for round-trip encrypt/decrypt
- ❌ No tests for invalid ciphertext format
- ❌ No tests for tampered auth tags (GCM integrity)
- ❌ No tests for missing ENCRYPTION_KEY env var
- ❌ No tests for incorrect key length (not 32 bytes)
- ❌ No tests for encryption of special characters, unicode, empty strings

**Impact:** Encryption bug could expose Portfolio Manager credentials or cause data loss.

##### 3. Rate Limiting (`src/lib/rate-limit.ts`) - **0 tests**
**Lines of code:** 67
**Risk:** HIGH - Prevents DoS attacks on API routes

**Untested functions:**
```typescript
- rateLimit.check(limit, token)   // No tests for sliding window
- apiLimiter                      // No tests for 60s window
- authLimiter                     // No tests for 15min window
- webhookLimiter                  // No tests for webhook-specific limits
```

**Critical test gaps:**
- ❌ No tests for window reset behavior
- ❌ No tests for token eviction at `uniqueTokenPerInterval` limit
- ❌ No tests for concurrent requests from same token
- ❌ No tests for memory leak prevention (cleanup function)
- ❌ No tests for time-based edge cases (requests at window boundary)

**Impact:** Rate limiter bug could allow DoS attacks or incorrectly block legitimate users.

#### 🔴 P0: Zero Test Coverage - Data Integrity

##### 4. CSV Parser (`src/lib/csv/parser.ts`) - **0 tests**
**Lines of code:** 110
**Risk:** HIGH - Processes user file uploads, critical for data import

**Untested functions:**
```typescript
- parseCsvLine(line)              // No tests for quoted fields, escaped quotes
- parseCsv(csvText)               // No tests for malformed CSV
- validateCsvHeaders(headers)     // No tests for missing required fields
```

**Critical test gaps:**
- ❌ No tests for CSV injection attacks (formula injection)
- ❌ No tests for unicode/special characters in CSV
- ❌ No tests for very large CSV files (10MB limit)
- ❌ No tests for malformed CSV (unmatched quotes, missing commas)
- ❌ No tests for empty CSV, CSV with only headers
- ❌ No tests for duplicate headers
- ❌ No tests for field count mismatch detection
- ❌ No tests for Windows (CRLF) vs Unix (LF) line endings

**Impact:** CSV parsing bug could cause data loss, incorrect imports, or security vulnerabilities.

##### 5. Reading Validator (`src/lib/validation/reading-validator.ts`) - **0 tests**
**Lines of code:** 162
**Risk:** HIGH - Validates utility data before database insert

**Untested validation rules:**
```typescript
- NEGATIVE_VALUE          // No tests for negative consumption
- INVALID_START_DATE      // No tests for invalid dates
- INVALID_END_DATE        // No tests for invalid dates
- INVALID_DATE_RANGE      // No tests for start >= end
- FUTURE_DATE             // No tests for future dates (warning)
- DUPLICATE_READING       // No tests for duplicate detection
- OUTLIER_DETECTED        // No tests for 3x average outlier (warning)
- UNIT_MISMATCH           // No tests for unexpected units (warning)
```

**Critical test gaps:**
- ❌ No tests for validation result structure
- ❌ No tests for severity levels (error vs warning)
- ❌ No tests for multiple simultaneous issues
- ❌ No tests for outlier detection with < 3 existing readings
- ❌ No tests for overlapping period detection
- ❌ No tests for edge dates (Jan 1, Dec 31, leap years)

**Impact:** Validation bug could allow invalid data into database, breaking compliance calculations.

##### 6. XML Parser (`src/lib/portfolio-manager/xml-parser.ts`) - **0 tests**
**Lines of code:** 162
**Risk:** HIGH - Parses EPA Portfolio Manager API responses

**Untested functions:**
```typescript
- extractTag(xml, tagName)                 // No tests for namespace handling
- extractAllTags(xml, tagName)            // No tests for multiple matches
- extractAttribute(xml, tagName, attr)    // No tests for missing attributes
- parsePropertyList(xml)                  // No tests for malformed XML
- parsePropertyDetails(xml)               // No tests for missing fields
- parseMeterList(xml)                     // No tests for meter variations
- parseConsumptionData(xml)               // No tests for usage data
- parseAccountInfo(xml)                   // No tests for account details
- parseErrorResponse(xml)                 // No tests for API errors
```

**Critical test gaps:**
- ❌ No tests for XML injection/XXE attacks
- ❌ No tests for namespace prefixes (common in SOAP APIs)
- ❌ No tests for escaped characters in XML
- ❌ No tests for empty/null responses
- ❌ No tests for malformed XML
- ❌ No tests for very large XML responses
- ❌ No tests with real EPA PM API responses

**Impact:** XML parsing bug could cause PM sync failures or data corruption.

#### 🔴 P0: Zero Test Coverage - Business Logic

##### 7. Compliance Service (`src/lib/emissions/compliance-service.ts`) - **0 tests**
**Lines of code:** 254
**Risk:** CRITICAL - Core service that calculates and persists compliance results

**Untested functions:**
```typescript
- calculateBuildingCompliance(buildingId, year)   // No tests for full calculation flow
- recalculateAllBuildings(orgId, year)            // No tests for bulk recalc
- getComplianceSummary(orgId, year)               // No tests for portfolio summary
```

**Critical test gaps:**
- ❌ No tests for locked compliance year (should throw error)
- ❌ No tests for missing building
- ❌ No tests for mixed-use vs single-use limit selection
- ❌ No tests for deduction calculation
- ❌ No tests for database transaction rollback on error
- ❌ No tests for upsert logic (insert vs update)
- ❌ No tests for cache invalidation
- ❌ No tests for portfolio summary aggregation
- ❌ No tests for error handling in bulk recalculation
- ❌ No tests for race conditions in concurrent calculations

**Impact:** This is the MOST CRITICAL untested code. Bugs here directly affect financial penalty calculations.

#### 🔴 P1: Zero Test Coverage - API Routes

##### 8. All API Routes - **0 tests**
**Files:** 9 route files
**Risk:** HIGH - Direct user-facing attack surface

**Untested routes:**
```typescript
POST /api/buildings/[id]/import           // CSV upload - 0 tests
GET  /api/compliance/portfolio            // Portfolio summary - 0 tests
GET  /api/compliance/[buildingId]         // Building compliance - 0 tests
GET  /api/import-jobs/[id]                // Import job status - 0 tests
POST /api/inngest                         // Inngest webhook - 0 tests
POST /api/reports/bulk                    // Bulk PDF generation - 0 tests
GET  /api/reports/[buildingId]            // Single PDF report - 0 tests
POST /api/webhooks/stripe                 // Stripe webhook - 0 tests
POST /api/billing                         // Billing operations - 0 tests
```

**Critical test gaps:**
- ❌ No tests for authentication/authorization on protected routes
- ❌ No tests for rate limiting enforcement
- ❌ No tests for input validation (malformed JSON, missing fields)
- ❌ No tests for error responses (400, 401, 404, 500)
- ❌ No tests for webhook signature validation (Stripe, Inngest)
- ❌ No tests for CORS/security headers
- ❌ No tests for SQL injection via route parameters
- ❌ No tests for request/response types matching OpenAPI spec (no spec exists)

**Impact:** API routes are the primary attack surface. Zero tests = zero confidence in security.

#### 🔴 P1: Zero Test Coverage - React Components

##### 9. All React Components - **0 tests**
**Files:** 60+ component files
**Risk:** MEDIUM - User-facing features, accessibility, usability

**Untested component categories:**
```
Compliance components (20 files):
- ComplianceStatusHero, EmissionsTrendChart, FuelBreakdownChart
- MonthlyEmissionsChart, WhatIfCalculator, DeductionForm
- BulkReportGenerator, ComplianceChecklist, DeadlineCalendar
- (and 11 more)

Building components (3 files):
- BuildingForm, OccupancyMixEditor, BuildingsPagination

UI components (30+ shadcn/ui components):
- Form, Input, Select, Table, Dialog, etc.
- (mostly imported from shadcn/ui, but usage not tested)
```

**Critical test gaps:**
- ❌ No tests for form validation in BuildingForm
- ❌ No tests for OccupancyMixEditor validation (sqft totals must match)
- ❌ No tests for WhatIfCalculator projection logic
- ❌ No tests for chart rendering (Recharts integration)
- ❌ No tests for accessibility (ARIA labels, keyboard nav)
- ❌ No tests for error states (loading, error boundaries)
- ❌ No tests for responsive layout breakpoints
- ❌ No tests for dark mode theme switching

**Impact:** UI bugs cause poor UX and accessibility issues, but don't directly impact data integrity.

#### 🔴 P2: Zero Test Coverage - Integrations

##### 10. Third-Party Service Integrations - **0 tests**

**Inngest (background jobs):**
```typescript
src/lib/inngest/process-csv-import.ts    // CSV import job - 0 tests
src/lib/inngest/functions.ts             // Job definitions - 0 tests
```
- ❌ No tests for CSV import job logic
- ❌ No tests for error handling and retry logic
- ❌ No tests for job status updates

**Stripe (payments):**
```typescript
src/lib/stripe/client.ts                 // Stripe client - 0 tests
```
- ❌ No tests for subscription creation
- ❌ No tests for webhook event handling
- ❌ No tests for payment method validation

**Portfolio Manager API:**
```typescript
src/lib/portfolio-manager/client.ts      // PM API client - 0 tests
src/lib/portfolio-manager/sync.ts        // Data sync - 0 tests
```
- ❌ No tests for API authentication
- ❌ No tests for retry logic on API errors
- ❌ No tests for sync job execution
- ❌ No tests for data transformation from PM to our schema

---

## Test Quality Analysis

### Existing Tests (calculator.test.ts, mixed-use.test.ts)

#### ✅ Strengths

1. **Comprehensive coverage of tested functions** - 53 tests cover nearly all code paths in the two files
2. **Good test organization** - Tests grouped by function with clear describe blocks
3. **Descriptive test names** - "converts therms to kBtu correctly" is clear and specific
4. **Proper assertions** - Uses `toBeCloseTo()` for floats, `toBe()` for exact matches
5. **Edge case coverage** - Tests empty data, zero values, boundary conditions
6. **Helper functions** - `makeFullYearReadings()` reduces duplication
7. **Error case testing** - Tests for unknown jurisdiction, invalid occupancy types
8. **Integration testing** - `calculateCompliance()` tests exercise the full calculation pipeline

#### ⚠️ Weaknesses

1. **No negative testing** - Missing tests for negative consumption values, negative sqft
2. **No performance testing** - No tests with 1000+ readings to verify scalability
3. **No fuzzing** - No randomized input testing to find unexpected edge cases
4. **No property-based testing** - Could use `fast-check` or similar for invariant testing
5. **Magic numbers in tests** - Some coefficient values (0.000288962) are hardcoded without explanation
6. **No test data builders** - Tests create data inline, could use factory pattern
7. **No mocking** - Tests don't use mocks (not needed for pure functions, but will be for other code)

---

## Coverage Metrics (Estimated)

| Category | Files | Tested | Untested | Coverage % |
|----------|-------|--------|----------|------------|
| **Calculation Engine** | 2 | 2 | 0 | 95% |
| **Auth & Security** | 3 | 0 | 3 | 0% |
| **Data Validation** | 2 | 0 | 2 | 0% |
| **API Routes** | 9 | 0 | 9 | 0% |
| **Business Logic** | 5 | 0 | 5 | 0% |
| **Components** | 60+ | 0 | 60+ | 0% |
| **Integrations** | 6 | 0 | 6 | 0% |
| **Utilities** | 10 | 0 | 10 | 0% |
| **Database Layer** | 5 | 0 | 5 | 0% |
| **TOTAL** | ~100 | 2 | ~98 | **~2-3%** |

**Note:** True line coverage likely <5% of total application code. The 53 passing tests cover only the pure calculation functions.

---

## Missing Test Types

### 1. Unit Tests (Missing for 95% of code)
**Status:** Only 2 files have unit tests
**Priority:** P0

**Needed for:**
- ❌ CSV parser (`parseCsv`, `validateCsvHeaders`)
- ❌ XML parser (all 9 functions)
- ❌ Reading validator (all 6 validation rules)
- ❌ Auth helpers (all 6 functions)
- ❌ Encryption (encrypt/decrypt)
- ❌ Rate limiter
- ❌ Utility functions (unit conversion, gap detector)

### 2. Integration Tests (0 tests)
**Status:** None exist
**Priority:** P0

**Needed for:**
- ❌ Database operations (CRUD for buildings, readings, compliance years)
- ❌ Compliance service (full calculation + database persistence)
- ❌ CSV import flow (parse → validate → insert)
- ❌ PM API sync flow (fetch → parse → transform → insert)
- ❌ Multi-step API workflows (create building → add accounts → import readings)

### 3. API Tests (0 tests)
**Status:** None exist
**Priority:** P0

**Needed for:**
- ❌ Authentication/authorization on all protected routes
- ❌ Rate limiting enforcement
- ❌ Input validation (400 responses)
- ❌ Error handling (500 responses)
- ❌ Webhook signature validation (Stripe, Inngest)
- ❌ Response schema validation

**Recommendation:** Use `msw` (Mock Service Worker) for mocking external APIs, or actual test API calls with Vitest.

### 4. Component Tests (0 tests)
**Status:** None exist
**Priority:** P1

**Needed for:**
- ❌ Form validation (BuildingForm, DeductionForm)
- ❌ Interactive components (WhatIfCalculator, OccupancyMixEditor)
- ❌ Data tables (BuildingsPagination, EmissionsBreakdownTable)
- ❌ Charts (EmissionsTrendChart, FuelBreakdownChart, MonthlyEmissionsChart)
- ❌ Dialogs and modals
- ❌ Error boundaries and loading states

**Recommendation:** Install `@testing-library/react` and `@testing-library/user-event` for component testing.

### 5. E2E Tests (0 tests)
**Status:** None exist
**Priority:** P1

**Needed for:**
- ❌ User signup → onboarding → create building → import CSV → view compliance
- ❌ Login → view portfolio → generate bulk reports
- ❌ Login → upgrade subscription → verify feature access
- ❌ CSV upload → background job processing → status updates
- ❌ PM sync → auto-import readings → recalculate compliance
- ❌ Mobile responsive flows
- ❌ Dark mode switching

**Recommendation:** Install Playwright for E2E testing. Target critical user journeys first.

### 6. Performance Tests (0 tests)
**Status:** None exist
**Priority:** P2

**Needed for:**
- ❌ Portfolio summary for 1000+ buildings
- ❌ Compliance calculation with 10,000+ readings
- ❌ Bulk report generation (50 buildings)
- ❌ CSV import of 10,000 rows
- ❌ Database query performance (N+1 detection)

**Recommendation:** Use `vitest.bench()` for micro-benchmarks, or k6/Artillery for load testing.

### 7. Security Tests (0 tests)
**Status:** None exist
**Priority:** P0

**Needed for:**
- ❌ IDOR attacks (access other org's buildings)
- ❌ SQL injection in route params and search inputs
- ❌ XSS in building names and addresses
- ❌ CSRF on state-changing endpoints
- ❌ Rate limit bypass attempts
- ❌ Webhook signature validation bypass
- ❌ JWT token tampering
- ❌ CSV injection (formula injection)

**Recommendation:** Add OWASP Top 10 test cases, use `npm audit` in CI, consider ZAP/Burp Suite scans.

### 8. Accessibility Tests (0 tests)
**Status:** None exist
**Priority:** P1

**Needed for:**
- ❌ Keyboard navigation (tab order, focus management)
- ❌ Screen reader compatibility (ARIA labels, roles)
- ❌ Color contrast (WCAG AA)
- ❌ Form labels and error messages
- ❌ Focus indicators
- ❌ Semantic HTML

**Recommendation:** Install `@testing-library/jest-dom`, `axe-core`, or `pa11y` for automated accessibility testing.

### 9. Snapshot Tests (0 tests)
**Status:** None exist
**Priority:** P2

**Needed for:**
- ❌ Chart component rendering
- ❌ PDF report generation
- ❌ Email templates
- ❌ Complex table layouts

**Recommendation:** Use Vitest snapshot testing for static output, Playwright for visual regression.

### 10. Contract Tests (0 tests)
**Status:** None exist
**Priority:** P2

**Needed for:**
- ❌ EPA Portfolio Manager API responses (XML schema)
- ❌ Stripe webhook payloads
- ❌ Inngest event schemas
- ❌ Database schema migrations

**Recommendation:** Use Pact or similar for consumer-driven contract testing, or JSON Schema validation.

---

## Test Data Management

### Current State: Ad-hoc inline data
**Problem:** Every test creates its own data objects, leading to:
- Duplication
- Inconsistency
- Maintenance burden
- Unclear intent (magic values)

**Example from existing tests:**
```typescript
const readings: UtilityReadingInput[] = [
  {
    utilityType: 'electricity',
    consumptionValue: 100000,  // Why 100,000?
    consumptionUnit: 'kwh',
    periodStart: '2024-01-01',
    periodEnd: '2024-01-31',
  },
];
```

### Recommended Approach: Test Data Builders

**Missing test utilities:**
- ❌ No factory functions for creating test data
- ❌ No fixtures directory
- ❌ No database seeding for integration tests
- ❌ No mock data generators (faker.js)

**Recommendation:** Create `src/lib/__tests__/factories/`:
```typescript
// factories/reading.factory.ts
export function makeReading(overrides?: Partial<UtilityReadingInput>): UtilityReadingInput {
  return {
    utilityType: 'electricity',
    consumptionValue: 10000,
    consumptionUnit: 'kwh',
    periodStart: '2024-01-01',
    periodEnd: '2024-01-31',
    ...overrides,
  };
}

// factories/building.factory.ts
export function makeBuilding(overrides?: Partial<Building>): Building {
  return {
    id: 'test-building-id',
    name: 'Test Building',
    grossSqft: 50000,
    occupancyType: 'B - Business',
    jurisdictionId: 'nyc-ll97',
    ...overrides,
  };
}
```

**Benefits:**
- Tests become more readable (`makeReading({ consumptionValue: 500000 })`)
- Defaults make sense, tests override only what matters
- Changes to data structure require updating only the factory

---

## Edge Cases & Corner Cases (Missing)

### Date/Time Edge Cases (Not tested)
- ❌ Leap years (Feb 29)
- ❌ Daylight saving time transitions
- ❌ Timezone handling (UTC vs local)
- ❌ End-of-month dates (Jan 31 → Feb 28)
- ❌ Year boundaries (Dec 31 → Jan 1)
- ❌ Invalid dates (Feb 30, Apr 31)

### Numeric Edge Cases (Not tested)
- ❌ Zero consumption
- ❌ Negative consumption (should error)
- ❌ Very large consumption (1e15)
- ❌ Very small consumption (0.0001)
- ❌ Floating point precision errors
- ❌ Division by zero
- ❌ Integer overflow (buildings with sqft > MAX_SAFE_INTEGER)

### String Edge Cases (Not tested)
- ❌ Empty strings
- ❌ Unicode characters (building names with emojis, Chinese characters)
- ❌ Very long strings (10,000 character addresses)
- ❌ SQL injection payloads
- ❌ XSS payloads
- ❌ CSV injection payloads

### Array Edge Cases (Not tested)
- ❌ Empty arrays
- ❌ Single-element arrays
- ❌ Very large arrays (10,000+ readings)
- ❌ Duplicate elements
- ❌ Null/undefined elements

### Concurrency Edge Cases (Not tested)
- ❌ Simultaneous writes to same compliance year
- ❌ Race conditions in cache invalidation
- ❌ Deadlocks in database transactions
- ❌ Rate limiter contention

### Integration Edge Cases (Not tested)
- ❌ EPA PM API timeout
- ❌ EPA PM API rate limit (429 responses)
- ❌ Stripe webhook delivery failure
- ❌ Inngest job retries
- ❌ Supabase auth session expiration
- ❌ Database connection pool exhaustion

---

## Test Organization & Structure

### Current Structure
```
src/lib/emissions/__tests__/
├── calculator.test.ts    (44 tests)
└── mixed-use.test.ts     (9 tests)
```

**Issues:**
- ✅ Tests are colocated with source code (good)
- ❌ Only one module has tests
- ❌ No clear naming convention documented
- ❌ No shared test utilities

### Recommended Structure
```
src/
├── lib/
│   ├── emissions/
│   │   ├── __tests__/
│   │   │   ├── calculator.test.ts
│   │   │   ├── mixed-use.test.ts
│   │   │   ├── compliance-service.test.ts          # NEW
│   │   │   └── compliance-service.integration.test.ts  # NEW
│   ├── auth/
│   │   ├── __tests__/
│   │   │   ├── helpers.test.ts                     # NEW
│   │   │   ├── encryption.test.ts                  # NEW
│   │   │   └── helpers.integration.test.ts         # NEW
│   ├── csv/
│   │   ├── __tests__/
│   │   │   ├── parser.test.ts                      # NEW
│   │   │   └── parser.edge-cases.test.ts           # NEW
│   ├── validation/
│   │   ├── __tests__/
│   │   │   └── reading-validator.test.ts           # NEW
│   ├── portfolio-manager/
│   │   ├── __tests__/
│   │   │   ├── xml-parser.test.ts                  # NEW
│   │   │   └── client.integration.test.ts          # NEW
│   └── __tests__/
│       ├── setup.ts                                # NEW - Global test setup
│       ├── factories/                              # NEW - Test data builders
│       │   ├── building.factory.ts
│       │   ├── reading.factory.ts
│       │   └── user.factory.ts
│       └── mocks/                                  # NEW - Mock implementations
│           ├── supabase.mock.ts
│           ├── stripe.mock.ts
│           └── pm-api.mock.ts
├── app/api/
│   ├── buildings/[id]/import/
│   │   ├── route.ts
│   │   └── route.test.ts                           # NEW
│   ├── compliance/portfolio/
│   │   ├── route.ts
│   │   └── route.test.ts                           # NEW
│   └── ... (similar for all routes)
├── components/
│   ├── compliance/
│   │   ├── what-if-calculator.tsx
│   │   └── what-if-calculator.test.tsx             # NEW
│   └── ... (similar for all components)
└── e2e/                                            # NEW
    ├── onboarding.spec.ts
    ├── csv-import.spec.ts
    ├── compliance-calculation.spec.ts
    └── reports.spec.ts
```

**Naming conventions:**
- `*.test.ts` - Unit tests
- `*.integration.test.ts` - Integration tests (touch database/external services)
- `*.spec.ts` - E2E tests (Playwright)
- `*.bench.ts` - Performance benchmarks

---

## CI/CD Testing Gaps

### Current CI Workflow (`.github/workflows/ci.yml`)

**What's tested:**
- ✅ TypeScript type checking (`tsc --noEmit`)
- ✅ Linting (`npm run lint`)
- ✅ Unit tests (`npm test`)

**What's missing:**
- ❌ **Coverage reporting** - No `vitest --coverage` or coverage upload to Codecov/Coveralls
- ❌ **Coverage thresholds** - No enforcement of minimum coverage %
- ❌ **Integration tests** - No database setup for integration tests
- ❌ **E2E tests** - No Playwright execution
- ❌ **Security scanning** - No `npm audit` or Snyk
- ❌ **Dependency checks** - No outdated dependency detection
- ❌ **Performance regression** - No benchmark comparison
- ❌ **Visual regression** - No screenshot comparison
- ❌ **Test result artifacts** - No JUnit XML upload for test analytics
- ❌ **Parallel test execution** - Tests run serially
- ❌ **Test matrix** - No testing against multiple Node versions

### Recommended CI Additions

```yaml
# .github/workflows/ci.yml (additions)
jobs:
  test:
    strategy:
      matrix:
        node-version: [20, 22]  # Test multiple Node versions
    steps:
      # ... existing steps ...

      - name: Run unit tests with coverage
        run: npm test -- --coverage --reporter=junit --reporter=default

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/coverage-final.json

      - name: Enforce coverage thresholds
        run: |
          # Fail if coverage < 70%
          npx c8 check-coverage --lines 70 --branches 70 --functions 70

      - name: Run integration tests
        run: npm run test:integration
        env:
          DATABASE_URL: postgres://test:test@localhost:5432/test_db

      - name: Upload test results
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: junit.xml

      - name: Security audit
        run: npm audit --audit-level=moderate

      - name: Check for outdated dependencies
        run: npm outdated || true

  e2e:
    needs: test
    steps:
      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload Playwright report
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

---

## Test Performance & Reliability

### Current Test Execution
```
Test Files  2 passed (2)
Tests      53 passed (53)
Duration   4.93s (transform 848ms, setup 0ms, import 932ms, tests 41ms)
```

**Analysis:**
- ✅ **Fast execution** - 53 tests in 41ms (pure functions are fast)
- ✅ **No flaky tests** - All tests pass consistently
- ⚠️ **Transform time** - 848ms transform time is high (17% of total)
- ⚠️ **Import time** - 932ms import time suggests large dependency graph

**Future concerns (when adding more tests):**
- ❌ Database tests will be slower (need test DB setup/teardown)
- ❌ API tests will be slower (need server spin-up)
- ❌ E2E tests will be much slower (5-30s per test)
- ❌ No test parallelization configured

### Recommendations for Scale

1. **Add coverage collection** (will add 10-20% overhead):
   ```bash
   npm install -D @vitest/coverage-v8
   ```

2. **Configure test timeouts** for slow tests:
   ```typescript
   // vitest.config.ts
   test: {
     testTimeout: 10000,  // 10s for integration tests
   }
   ```

3. **Use test pooling** for parallel execution:
   ```typescript
   // vitest.config.ts
   test: {
     pool: 'threads',
     poolOptions: {
       threads: { maxThreads: 4 },
     },
   }
   ```

4. **Split test suites** by speed:
   ```json
   // package.json
   {
     "scripts": {
       "test": "vitest run",
       "test:unit": "vitest run src/**/*.test.ts",
       "test:integration": "vitest run src/**/*.integration.test.ts",
       "test:e2e": "playwright test"
     }
   }
   ```

5. **Mock slow operations** (database, external APIs) in unit tests:
   ```typescript
   vi.mock('@/lib/supabase/server', () => ({
     createClient: vi.fn(() => mockSupabaseClient),
   }));
   ```

---

## Flaky Test Risk Assessment

**Current risk: LOW** (only pure function tests exist)

**Future risk: HIGH** when adding:
- ⚠️ Database tests (race conditions, cleanup issues)
- ⚠️ Time-dependent tests (date mocking needed)
- ⚠️ API tests (network timeouts, external service downtime)
- ⚠️ E2E tests (browser timing issues, animation delays)

### Flakiness Prevention Strategies

1. **Deterministic time** - Always mock `Date.now()`:
   ```typescript
   vi.useFakeTimers();
   vi.setSystemTime(new Date('2024-01-01'));
   ```

2. **Test isolation** - Each test gets fresh database state:
   ```typescript
   beforeEach(async () => {
     await db.delete(buildings).where(sql`1=1`);
     await db.delete(utilityReadings).where(sql`1=1`);
   });
   ```

3. **Retry flaky tests** (Playwright auto-retries):
   ```typescript
   // playwright.config.ts
   retries: process.env.CI ? 2 : 0,
   ```

4. **Wait for async operations** - Don't use `sleep()`:
   ```typescript
   // BAD
   await sleep(1000);

   // GOOD
   await waitFor(() => expect(element).toBeInTheDocument());
   ```

5. **Avoid hardcoded IDs** - Use factories with unique IDs:
   ```typescript
   const building = makeBuilding({ id: randomUUID() });
   ```

---

## Test Documentation

### Current State
- ❌ No testing guidelines document
- ❌ No testing best practices
- ❌ No examples of how to write tests
- ❌ No contribution guide for adding tests
- ✅ Test names are descriptive (good)

### Recommended Documentation

**Create `TESTING.md` in repo root:**
```markdown
# Testing Guide

## Running Tests
- `npm test` - Run all unit tests
- `npm test:watch` - Run tests in watch mode
- `npm test:coverage` - Generate coverage report
- `npm test:integration` - Run integration tests
- `npm test:e2e` - Run E2E tests

## Writing Tests
- Place tests in `__tests__/` next to source code
- Name files `*.test.ts` for unit tests, `*.integration.test.ts` for integration
- Use factories from `src/lib/__tests__/factories/` for test data
- Mock external services (Supabase, Stripe, EPA PM API)

## Test Quality Standards
- Minimum 70% line coverage for new code
- All P0/P1 bugs must have regression tests
- Integration tests for all API routes
- E2E tests for critical user journeys

## Test Data
- Use factories for creating test objects
- Never use production data
- Clean up after integration tests

## Debugging Flaky Tests
- Run test 10 times: `npm test -- --repeat=10`
- Check for async timing issues
- Verify test isolation (each test should be independent)
```

---

## Recommendations Summary

### Immediate (P0) - Critical Security & Data Integrity

1. **Add encryption tests** (CRITICAL):
   - Test round-trip encrypt/decrypt
   - Test invalid key handling
   - Test tampered ciphertext

2. **Add auth tests** (CRITICAL):
   - Test `assertBuildingAccess()` with IDOR scenarios
   - Test `filterAuthorizedBuildingIds()` with unauthorized IDs
   - Test session expiration handling

3. **Add CSV parser tests** (HIGH):
   - Test malformed CSV, escaped quotes, large files
   - Test CSV injection prevention
   - Test error handling

4. **Add reading validator tests** (HIGH):
   - Test all 6 validation rules
   - Test multiple issues simultaneously
   - Test severity levels

5. **Add compliance service tests** (CRITICAL):
   - Test locked compliance year rejection
   - Test database transaction rollback
   - Test mixed-use vs single-use limit selection

### Short-term (P1) - API & Component Coverage

6. **Add API route tests** (HIGH):
   - Test authentication/authorization
   - Test rate limiting
   - Test input validation and error responses

7. **Add component tests** (MEDIUM):
   - Install `@testing-library/react`
   - Test form validation (BuildingForm, OccupancyMixEditor)
   - Test interactive components (WhatIfCalculator)

8. **Set up E2E tests** (MEDIUM):
   - Install Playwright
   - Test critical user journey: signup → create building → import CSV → view compliance
   - Test CSV upload background job flow

9. **Add coverage tooling** (HIGH):
   - Install `@vitest/coverage-v8`
   - Configure CI to collect and report coverage
   - Set minimum thresholds (70% line, 70% branch)

### Medium-term (P2) - Test Infrastructure

10. **Create test utilities** (MEDIUM):
    - Build test data factories
    - Create mock implementations for Supabase, Stripe, PM API
    - Add test database seeding

11. **Add integration tests** (MEDIUM):
    - Test database operations (CRUD)
    - Test full compliance calculation + persistence
    - Test CSV import pipeline

12. **Add security tests** (MEDIUM):
    - Test IDOR protection
    - Test SQL injection prevention
    - Test webhook signature validation

13. **Add accessibility tests** (LOW):
    - Install `axe-core`
    - Test keyboard navigation
    - Test ARIA labels

### Long-term (P3) - Advanced Testing

14. **Performance testing** (LOW):
    - Benchmark portfolio summary for 1000+ buildings
    - Load test API routes
    - Profile database queries

15. **Contract testing** (LOW):
    - Validate EPA PM API response schemas
    - Validate Stripe webhook schemas

16. **Visual regression** (LOW):
    - Set up Playwright screenshot comparison
    - Test chart rendering consistency

---

## Risk Assessment

### Without Improved Testing

| Risk | Likelihood | Impact | Overall |
|------|------------|--------|---------|
| **IDOR vulnerability exposes all buildings** | Medium | Critical | HIGH |
| **Encryption bug exposes PM credentials** | Medium | Critical | HIGH |
| **CSV parsing bug causes data loss** | High | High | HIGH |
| **Compliance calculation bug overcharges penalties** | Medium | Critical | HIGH |
| **Rate limiter bypass allows DoS** | Low | High | MEDIUM |
| **API auth bug allows unauthorized access** | Medium | Critical | HIGH |
| **Validation bug allows invalid data** | High | Medium | MEDIUM |
| **PM sync bug corrupts readings** | Medium | Medium | MEDIUM |
| **Component bug breaks UX** | High | Low | MEDIUM |

**Overall project risk: HIGH**

The lack of tests for security-critical code (auth, encryption), data integrity code (CSV parser, validator), and business logic (compliance service) creates significant risk of production incidents.

---

## Comparison to Industry Standards

### Test Coverage Benchmarks

| Application Type | Typical Coverage | Building Compliance OS |
|------------------|------------------|------------------------|
| **SaaS (average)** | 60-70% | ~2-3% |
| **FinTech/Compliance** | 80-90% | ~2-3% |
| **Startups** | 40-60% | ~2-3% |
| **Open source** | 70-80% | ~2-3% |

**Verdict:** Building Compliance OS is significantly below industry standards for all categories.

### Test Types by Industry

| Test Type | Industry Standard | Building Compliance OS |
|-----------|-------------------|------------------------|
| **Unit tests** | 60-80% of code | 2% of code |
| **Integration tests** | 20-30% of code | 0% of code |
| **E2E tests** | 5-10 critical paths | 0 tests |
| **API tests** | All endpoints | 0 tests |
| **Component tests** | Interactive components | 0 tests |

---

## Testing Roadmap (Prioritized)

### Week 1: Critical Security (P0)
- [ ] Add encryption round-trip tests
- [ ] Add `assertBuildingAccess()` IDOR tests
- [ ] Add CSV parser injection prevention tests
- [ ] Add reading validator tests
- [ ] Install coverage tooling

### Week 2: Core Business Logic (P0)
- [ ] Add compliance service unit tests
- [ ] Add compliance service integration tests (with test DB)
- [ ] Add rate limiter tests
- [ ] Add XML parser tests

### Week 3: API Coverage (P1)
- [ ] Add API route tests for authentication
- [ ] Add API route tests for CSV import
- [ ] Add API route tests for compliance endpoints
- [ ] Add webhook validation tests

### Week 4: Component & E2E (P1)
- [ ] Install `@testing-library/react`
- [ ] Add BuildingForm validation tests
- [ ] Install Playwright
- [ ] Add CSV upload E2E test

### Month 2: Integration & Utilities (P2)
- [ ] Create test data factories
- [ ] Add database integration tests
- [ ] Add PM API client integration tests
- [ ] Add Inngest job tests

### Month 3: Advanced Testing (P3)
- [ ] Add performance benchmarks
- [ ] Add accessibility tests
- [ ] Add visual regression tests
- [ ] Add contract tests for external APIs

---

## Actionable Next Steps

### Step 1: Install Missing Dependencies
```bash
npm install -D @vitest/coverage-v8 @testing-library/react @testing-library/user-event @testing-library/jest-dom msw
npx playwright install --with-deps
```

### Step 2: Configure Coverage
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}'],
      thresholds: {
        lines: 70,
        branches: 70,
        functions: 70,
        statements: 70,
      },
    },
  },
});
```

### Step 3: Create First Critical Tests
```bash
# Create these files in priority order:
touch src/lib/auth/__tests__/encryption.test.ts
touch src/lib/auth/__tests__/helpers.test.ts
touch src/lib/csv/__tests__/parser.test.ts
touch src/lib/validation/__tests__/reading-validator.test.ts
touch src/lib/emissions/__tests__/compliance-service.test.ts
```

### Step 4: Update CI
```yaml
# .github/workflows/ci.yml
- name: Run tests with coverage
  run: npm test -- --coverage
- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v3
```

### Step 5: Document Testing Standards
```bash
# Create TESTING.md with guidelines
touch TESTING.md
```

---

## Conclusion

The Building Compliance OS has made a good start by adding 53 well-written unit tests for the core calculation engine. However, with **~2-3% overall code coverage**, the application has significant quality risk.

**Critical gaps:**
- 🔴 Zero tests for authentication/authorization (IDOR risk)
- 🔴 Zero tests for encryption (credential exposure risk)
- 🔴 Zero tests for CSV parser (data loss/injection risk)
- 🔴 Zero tests for compliance service (financial calculation errors)
- 🔴 Zero tests for all 9 API routes (security vulnerabilities)
- 🔴 Zero tests for 60+ React components (UX bugs)

**Recommended immediate actions:**
1. Add tests for `src/lib/auth/encryption.ts` (5 tests)
2. Add tests for `src/lib/auth/helpers.ts` (8 tests)
3. Add tests for `src/lib/csv/parser.ts` (10 tests)
4. Add tests for `src/lib/validation/reading-validator.ts` (12 tests)
5. Add tests for `src/lib/emissions/compliance-service.ts` (15 tests)

**Target:** Reach 40% coverage in 1 month, 70% in 3 months.

**Final Grade: D+**
- Excellent quality of existing tests (+1 letter grade)
- Critical security code untested (-2 letter grades)
- No integration or E2E tests (-1 letter grade)

With focused effort on the roadmap above, this could reach B+ within 3 months.
