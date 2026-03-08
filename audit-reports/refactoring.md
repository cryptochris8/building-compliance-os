# Refactoring Assessment Report
**Building Compliance OS - Code Quality & Technical Debt Analysis**

**Date**: 2026-03-07
**Codebase**: D:\building-compliance-os
**Overall Grade**: B-
**Technical Debt Level**: Moderate

---

## Executive Summary

The Building Compliance OS codebase demonstrates **solid architectural foundations** with excellent separation of concerns and type safety. However, there are **systematic patterns of technical debt** that warrant attention:

- **Strengths**: Pure calculation engine, shared auth helpers, excellent type safety, good use of transactions
- **Key Issues**: Excessive type coercion (152 instances), data duplication across layers, repetitive auth patterns, inline queries in pages
- **Risk Level**: Medium - Code is stable but maintenance velocity will decrease over time

---

## 1. Code Smell Analysis

### 1.1 Primitive Obsession & Type Coercion (PRIORITY 1)

**Severity**: High
**Impact**: Type safety erosion, runtime errors, maintenance burden

**Finding**: 152 instances of `String()` and `Number()` coercion across 42 files, primarily in:
- `src/lib/emissions/compliance-service.ts` (16 instances)
- `src/app/api/reports/[buildingId]/route.ts` (17 instances)
- `src/app/(dashboard)/buildings/[id]/compliance/page.tsx` (14 instances)
- `src/app/(dashboard)/buildings/page.tsx` (4 instances)

**Example** (compliance-service.ts):
```typescript
// Current: Primitive obsession
const grossEmissions = Number(cy?.totalEmissionsTco2e || 0);
const netEmissions = Math.max(0, grossEmissions - totalDeductions);
await tx.update(complianceYears).set({
  totalDeductionsTco2e: String(Math.round(totalDeductions * 1000) / 1000),
  netEmissionsTco2e: String(Math.round(netEmissions * 1000) / 1000),
});
```

**Root Cause**: Schema uses `numeric` type (stored as strings in Postgres) but business logic uses numbers, creating constant back-and-forth coercion.

**Recommendation**:
1. Create a `Money` value object: `class EmissionsValue { constructor(private tco2e: number) }`
2. Add `toDbString()` and `fromDbString()` methods to encapsulate coercion
3. Use Drizzle's `.$type<number>()` for numeric columns to handle coercion in the ORM layer
4. Alternatively: Migrate `numeric` columns to `doublePrecision` for native number support

**Estimated Effort**: 3 days (create value objects + migrate 42 files)

---

### 1.2 Duplicated Authorization Logic (PRIORITY 2)

**Severity**: Medium
**Impact**: Maintainability, security consistency

**Finding**: Auth helpers (`assertBuildingAccess`, `getAuthUser`, `getUserOrgId`) are called 76+ times across 31 files. While helpers exist, the pattern is repetitive:

```typescript
// Pattern repeated in 15+ server actions
const user = await getAuthUser();
if (!user) return { error: 'Unauthorized' };

const access = await assertBuildingAccess(buildingId);
if (!access) return { error: 'Building not found or access denied' };
```

**Smell**: Feature Envy - Every action function needs to know about auth internals.

**Recommendation**:
1. Create a `@requireAuth` decorator or higher-order function:
   ```typescript
   export const withBuildingAuth = <T>(
     fn: (buildingId: string, ctx: AuthContext) => Promise<T>
   ) => async (buildingId: string) => {
     const ctx = await getAuthContext();
     if (!ctx) throw new UnauthorizedError();
     const access = await assertBuildingAccess(buildingId);
     if (!access) throw new ForbiddenError();
     return fn(buildingId, { ...ctx, orgId: access.orgId });
   };
   ```

2. Simplify actions:
   ```typescript
   export const deleteReading = withBuildingAuth(async (id, buildingId, ctx) => {
     // Auth is already verified
     await db.delete(utilityReadings).where(eq(utilityReadings.id, id));
   });
   ```

**Estimated Effort**: 2 days (create wrapper + refactor 31 files)

---

### 1.3 Data Duplication Across Layers (PRIORITY 1)

**Severity**: High
**Impact**: Maintenance burden, data consistency risk

**Finding**: Database queries are duplicated between server pages and server actions. Example:

**src/app/(dashboard)/buildings/page.tsx** (lines 60-79):
```typescript
const latestCyYear = db.select({
  buildingId: complianceYears.buildingId,
  maxYear: sql<number>`max(${complianceYears.year})`.as('max_year'),
}).from(complianceYears).groupBy(complianceYears.buildingId).as('latest_cy');

const rows = await db.select({
  building: buildingsTable,
  latestStatus: complianceYears.status,
}).from(buildingsTable)
  .leftJoin(latestCyYear, eq(latestCyYear.buildingId, buildingsTable.id))
  .leftJoin(complianceYears, and(
    eq(complianceYears.buildingId, buildingsTable.id),
    eq(complianceYears.year, latestCyYear.maxYear)
  ))
  .where(eq(buildingsTable.organizationId, dbUser.organizationId));
```

**src/app/(dashboard)/compliance/page.tsx** (lines 36-55):
```typescript
const orgBuildings = await db.select({
  id: buildings.id,
  name: buildings.name,
  jurisdictionId: buildings.jurisdictionId,
}).from(buildings).where(eq(buildings.organizationId, orgId));

const buildingIds = orgBuildings.map(b => b.id);
const allCyRecords = await db.select().from(complianceYears)
  .where(inArray(complianceYears.buildingId, buildingIds))
  .orderBy(desc(complianceYears.year));

const cyByBuilding = new Map<string, typeof allCyRecords>();
for (const cy of allCyRecords) {
  const existing = cyByBuilding.get(cy.buildingId) || [];
  existing.push(cy);
  cyByBuilding.set(cy.buildingId, existing);
}
```

**Smell**: Shotgun Surgery - Changes to building query logic require updates in 10+ files.

**Recommendation**:
1. Create a **repository layer** in `src/lib/repositories/`:
   ```typescript
   // src/lib/repositories/buildings.ts
   export class BuildingRepository {
     async getBuildingsWithLatestCompliance(orgId: string, options: PaginationOptions) {
       // Centralized query logic
     }

     async getBuildingsForComplianceCalendar(orgId: string) {
       // Centralized query logic
     }
   }
   ```

2. **Extract 61+ inline DB queries** from pages to repositories
3. Pages become thin data-fetching layers

**Estimated Effort**: 5 days (create repositories + migrate 17 page files)

---

### 1.4 God Page Component (PRIORITY 2)

**Severity**: Medium
**Impact**: Readability, testability

**Finding**: `src/app/(dashboard)/buildings/[id]/compliance/page.tsx` is 168 lines with multiple responsibilities:

1. Fetch building data
2. Fetch compliance data
3. Fetch utility accounts
4. Fetch utility readings
5. Filter readings by year
6. Fetch documents
7. Fetch activities
8. Calculate deductions
9. Build checklist state
10. Render 4 client components

**Cyclomatic Complexity**: Estimated 8-10 (moderate)

**Recommendation**:
1. Extract data fetching to a repository:
   ```typescript
   // src/lib/repositories/compliance-page.ts
   export async function getCompliancePageData(buildingId: string, year: number) {
     const [building, complianceData, accounts, readings, activities] =
       await Promise.all([
         buildingRepo.getById(buildingId),
         complianceRepo.getByYear(buildingId, year),
         utilityAccountRepo.getByBuilding(buildingId),
         utilityReadingRepo.getByYear(buildingId, year),
         activityRepo.getByBuilding(buildingId),
       ]);

     return { building, complianceData, accounts, readings, activities };
   }
   ```

2. Page becomes:
   ```typescript
   export default async function BuildingCompliancePage({ params, searchParams }) {
     const { id } = await params;
     const { year } = await searchParams;
     const data = await getCompliancePageData(id, year);
     return <ComplianceDetailClient {...data} />;
   }
   ```

**Estimated Effort**: 1 day per complex page (10 pages × 1 day = 10 days)

---

### 1.5 Magic Strings & Enums (PRIORITY 3)

**Severity**: Low
**Impact**: Typo risk, refactoring difficulty

**Finding**: Status strings are scattered:
- `'incomplete' | 'compliant' | 'at_risk' | 'over_limit'` repeated 15+ times
- `'confirmed' | 'estimated' | 'flagged'` repeated 10+ times
- Enums exist in schema but not exported as TypeScript constants

**Example**:
```typescript
// Current: Magic strings
if (status === 'compliant') compliantCount++;
else if (status === 'at_risk') atRiskCount++;
else if (status === 'over_limit') overLimitCount++;
else incompleteCount++;

// Better: Use enum
if (status === ComplianceStatus.COMPLIANT) compliantCount++;
```

**Recommendation**:
1. Export schema enums as TypeScript constants:
   ```typescript
   export const ComplianceStatus = {
     INCOMPLETE: 'incomplete',
     COMPLIANT: 'compliant',
     AT_RISK: 'at_risk',
     OVER_LIMIT: 'over_limit',
   } as const;
   ```

2. Replace magic strings with enum references

**Estimated Effort**: 1 day (export enums + find-replace 40+ files)

---

### 1.6 Long Parameter Lists (PRIORITY 3)

**Severity**: Low
**Impact**: API ergonomics

**Finding**: Functions with 5+ parameters:
- `calculateCompliance(readings, grossSqft, occupancyType, jurisdictionId, year)` - 5 params
- `updateDeductionTotals(complianceYearId, tx)` - Should be method on ComplianceYear
- `logActivity(buildingId, complianceYearId, activityType, description, actorId, orgId, metadata?)` - 7 params

**Recommendation**:
1. Use parameter objects:
   ```typescript
   interface CalculateComplianceParams {
     readings: UtilityReadingInput[];
     grossSqft: number;
     occupancyType: string;
     jurisdictionId: string;
     year: number;
   }

   export function calculateCompliance(params: CalculateComplianceParams) {
     // Destructure inside
   }
   ```

**Estimated Effort**: 1 day (refactor 8 functions)

---

## 2. SOLID Principles Assessment

### 2.1 Single Responsibility Principle (SRP) - Grade: C+

**Violations**:

1. **compliance-service.ts** (254 lines)
   - Responsibility 1: Calculate compliance
   - Responsibility 2: Persist compliance to DB
   - Responsibility 3: Recalculate portfolio
   - Responsibility 4: Cache management
   - **Fix**: Split into `ComplianceCalculator`, `ComplianceRepository`, `PortfolioService`

2. **readings.ts** (160 lines)
   - Responsibility 1: Validate reading data
   - Responsibility 2: Check year locks
   - Responsibility 3: Insert/update/delete
   - Responsibility 4: Trigger recalculation
   - Responsibility 5: Revalidate cache
   - **Fix**: Split into `ReadingValidator`, `ReadingRepository`, `ComplianceRecalculator`

3. **Page components** (15 files)
   - Responsibility 1: Fetch data
   - Responsibility 2: Transform data
   - Responsibility 3: Render UI
   - **Fix**: Extract data fetching to repositories

---

### 2.2 Open/Closed Principle (OCP) - Grade: B+

**Strengths**:
- Jurisdiction system is **excellent** - plugin architecture in `src/lib/jurisdictions/`
- Easy to add new jurisdictions without modifying existing code
- Mixed-use calculation properly extends single-occupancy

**Violations**:
- Deduction types are hardcoded enum, not extensible
- No plugin system for new utility types beyond the 5 predefined

---

### 2.3 Liskov Substitution Principle (LSP) - Grade: A-

**Strengths**:
- No class hierarchies to violate LSP
- Type system enforces contracts well

---

### 2.4 Interface Segregation Principle (ISP) - Grade: B

**Violations**:
- `ComplianceResultWithBreakdown` extends `ComplianceResult` with `breakdownByFuel`, `breakdownByMonth`, `buildingId`, `year`
- Consumers that only need status don't need fuel breakdowns
- **Fix**: Split into `ComplianceStatus` and `ComplianceDetail`

---

### 2.5 Dependency Inversion Principle (DIP) - Grade: C

**Violations**:
- Server actions directly import `db` from `@/lib/db`
- No abstraction layer between business logic and data access
- **Fix**: Inject repository interfaces instead of concrete DB

---

## 3. Design Pattern Opportunities

### 3.1 Repository Pattern (RECOMMENDED)

**Current**: 61+ inline DB queries in pages and actions
**Target**: Centralized data access layer

**Benefits**:
- Single source of truth for queries
- Easier to test (mock repositories)
- Easier to optimize (caching, batching)

---

### 3.2 Service Layer Pattern (RECOMMENDED)

**Current**: Business logic scattered across actions and pages
**Target**: Dedicated service classes

**Example**:
```typescript
// src/lib/services/compliance-service.ts
export class ComplianceService {
  constructor(
    private complianceRepo: ComplianceRepository,
    private readingRepo: UtilityReadingRepository,
    private calculator: EmissionsCalculator
  ) {}

  async calculateAndPersist(buildingId: string, year: number) {
    const readings = await this.readingRepo.getByYear(buildingId, year);
    const result = this.calculator.calculate(readings);
    await this.complianceRepo.upsert(result);
    return result;
  }
}
```

---

### 3.3 Value Object Pattern (RECOMMENDED)

**Current**: Primitives everywhere (`number`, `string`)
**Target**: Domain-specific types

**Example**:
```typescript
class EmissionsValue {
  private constructor(private readonly tco2e: number) {
    if (tco2e < 0) throw new Error('Emissions cannot be negative');
  }

  static fromTco2e(value: number) { return new EmissionsValue(value); }
  static fromDbString(value: string) { return new EmissionsValue(Number(value)); }

  toTco2e() { return this.tco2e; }
  toDbString() { return String(Math.round(this.tco2e * 1000) / 1000); }

  add(other: EmissionsValue) {
    return new EmissionsValue(this.tco2e + other.tco2e);
  }
}
```

---

### 3.4 Factory Pattern (CONSIDER)

**Use Case**: Creating compliance calculations with different strategies

```typescript
interface ComplianceCalculationStrategy {
  calculate(readings: UtilityReadingInput[], building: Building): ComplianceResult;
}

class SingleOccupancyStrategy implements ComplianceCalculationStrategy { ... }
class MixedUseStrategy implements ComplianceCalculationStrategy { ... }

class ComplianceCalculatorFactory {
  static create(building: Building): ComplianceCalculationStrategy {
    if (building.occupancyMix && building.occupancyMix.length > 0) {
      return new MixedUseStrategy();
    }
    return new SingleOccupancyStrategy();
  }
}
```

---

## 4. Complexity Metrics

### 4.1 Cyclomatic Complexity

**High Complexity Functions** (estimated):

| Function | File | Lines | Estimated CC | Risk |
|----------|------|-------|--------------|------|
| `calculateBuildingCompliance` | compliance-service.ts | 113 | 8 | Medium |
| `syncMeterData` | portfolio-manager/sync.ts | 107 | 9 | Medium |
| `BuildingCompliancePage` | buildings/[id]/compliance/page.tsx | 168 | 10 | Medium |
| `updateDeduction` | actions/deductions.ts | 32 | 5 | Low |
| `createReading` | actions/readings.ts | 42 | 6 | Low |

**Note**: None exceed critical threshold (CC > 15), but medium complexity functions would benefit from extraction.

---

### 4.2 Coupling Analysis

**High Coupling Modules**:

1. **compliance-service.ts**
   - Imports: db, buildings, utilityReadings, utilityAccounts, complianceYears, deductions, calculator, mixed-use
   - **Coupling Score**: 8/10 (High)
   - **Fix**: Inject dependencies

2. **readings.ts**
   - Imports: db, utilityReadings, complianceYears, revalidatePath, revalidateTag, triggerRecalculation
   - **Coupling Score**: 6/10 (Medium)
   - **Fix**: Extract recalculation trigger to event bus

---

### 4.3 Cohesion Analysis

**Low Cohesion Modules**:

1. **compliance-workflow.ts** (246 lines)
   - Functions: `updateChecklist`, `lockComplianceYear`, `unlockComplianceYear`, `addComplianceNote`, `bulkMarkSubmitted`, `bulkRecalculate`, `getComplianceActivities`
   - **Issue**: Workflow operations mixed with activity logging
   - **Fix**: Split into `ComplianceWorkflowService` and `ActivityLogService`

2. **actions/reports.ts** (87 lines)
   - Functions: `getReportHistory`, `getAvailableYears`, `markReportSubmitted`, `getPortfolioBuildings`
   - **Issue**: Report-specific + portfolio-wide queries mixed
   - **Fix**: Split into `ReportService` and `PortfolioService`

---

## 5. Dead Code & Unused Exports

**Finding**: Minimal dead code detected (excellent!)

**Potential Cleanup**:
1. `src/lib/validation/gap-detector.ts` - Only 1 function, may be underutilized
2. `onboarding.ts` functions `completeStep()` and `markOnboardingComplete()` are no-ops (void step)
3. Check if all Portfolio Manager XML parser functions are actually used

**Estimated Savings**: ~200 lines

---

## 6. Anti-Patterns Detected

### 6.1 Anemic Domain Model (MAJOR)

**Symptom**: Data structures with no behavior

```typescript
// Current: Anemic
interface ComplianceResult {
  totalEmissionsTco2e: number;
  emissionsLimitTco2e: number;
  status: string;
}

// All logic is external:
const isCompliant = result.status === 'compliant';
const penalty = calculatePenalty(result.totalEmissionsTco2e, result.emissionsLimitTco2e);
```

**Better**: Rich domain model
```typescript
class ComplianceResult {
  constructor(
    private emissions: EmissionsValue,
    private limit: EmissionsValue,
    private status: ComplianceStatus
  ) {}

  isCompliant() { return this.status === ComplianceStatus.COMPLIANT; }
  calculatePenalty(jurisdiction: Jurisdiction) {
    return this.emissions.exceedingLimit(this.limit).multiply(jurisdiction.penaltyRate);
  }
}
```

---

### 6.2 Train Wreck Chaining (MINOR)

**Example**:
```typescript
// buildings/page.tsx
const total = Number(countResult?.count || 0);
```

**Better**:
```typescript
const total = countResult?.count ?? 0; // Nullish coalescing is cleaner
```

---

### 6.3 String Concatenation for Paths (MINOR)

**Finding**: 40+ instances of `'/buildings/' + buildingId + '/compliance'`

**Recommendation**: Extract to path builder utility
```typescript
export const paths = {
  building: {
    compliance: (id: string) => `/buildings/${id}/compliance`,
    readings: (id: string) => `/buildings/${id}/readings`,
  }
};
```

---

## 7. Refactoring Priority Matrix

| Priority | Smell | Files Affected | Effort (days) | Impact | ROI |
|----------|-------|----------------|---------------|--------|-----|
| **P0** | Primitive Obsession (String/Number coercion) | 42 | 3 | High | High |
| **P0** | Data Duplication (inline queries) | 17 | 5 | High | High |
| **P1** | Auth Pattern Duplication | 31 | 2 | Medium | High |
| **P1** | God Page Components | 10 | 10 | Medium | Medium |
| **P2** | SRP Violations (service split) | 5 | 5 | Medium | Medium |
| **P2** | Magic Strings → Enums | 40 | 1 | Low | High |
| **P3** | Long Parameter Lists | 8 | 1 | Low | Low |
| **P3** | Path String Concatenation | 40 | 0.5 | Low | Low |

**Total Refactoring Effort**: 27.5 days (~5.5 weeks)

---

## 8. Recommendations by Phase

### Phase 1: Quick Wins (1 week)
1. ✅ Export schema enums as constants
2. ✅ Create path builder utility
3. ✅ Remove dead code (gap-detector, no-op onboarding)
4. ✅ Extract `withBuildingAuth` wrapper

**Impact**: Immediate reduction in duplication, better DX

---

### Phase 2: Core Refactoring (3 weeks)
1. ✅ Create value objects (EmissionsValue, Money)
2. ✅ Implement repository layer
3. ✅ Extract page data fetching to repositories
4. ✅ Split compliance-service into calculator + repository

**Impact**: Drastically improved maintainability, testability

---

### Phase 3: Architecture Improvements (1.5 weeks)
1. ✅ Split large service files (compliance-workflow, readings)
2. ✅ Create service layer with DI
3. ✅ Refactor god page components
4. ✅ Add factory pattern for calculation strategies

**Impact**: Better separation of concerns, easier testing

---

## 9. Testing Recommendations

**Current State**:
- ✅ 53 tests for calculator.ts and mixed-use.ts
- ❌ No tests for repositories, services, or server actions

**Recommendation**:
1. Add integration tests for repositories
2. Add unit tests for service layer
3. Mock repositories in service tests (after Phase 2)

**Estimated Effort**: 2 weeks (parallel to Phase 3)

---

## 10. Metrics Tracking

**Before Refactoring**:
- Type coercion instances: 152
- Inline DB queries: 61
- Auth pattern duplication: 76
- Average file length (services): 180 lines
- Cyclomatic complexity (max): 10

**Target After Refactoring**:
- Type coercion instances: <20 (87% reduction)
- Inline DB queries: 0 (100% elimination)
- Auth pattern duplication: <10 (87% reduction)
- Average file length (services): <100 lines (44% reduction)
- Cyclomatic complexity (max): <8 (20% reduction)

---

## 11. Conclusion

The Building Compliance OS codebase is **structurally sound** with excellent type safety and domain modeling in the core calculation engine. However, it suffers from:

1. **Systematic over-use of primitive types** instead of domain objects
2. **Lack of abstraction** between data access and business logic
3. **Repetitive patterns** that could be eliminated with higher-order functions

**Grade**: **B-** (Good foundation, needs systematic cleanup)

**Risk Level**: **Medium** (Code is stable but technical debt is accumulating)

**Recommended Action**: Execute Phase 1 and Phase 2 refactoring (4 weeks total) to move from B- to A- grade.

---

## Appendix: Code Review Checklist for Future PRs

- [ ] No inline DB queries in pages (use repositories)
- [ ] No `String()` or `Number()` coercion (use value objects)
- [ ] No magic strings (use exported enums)
- [ ] Auth is handled by `withBuildingAuth` wrapper
- [ ] Functions have <5 parameters (use param objects)
- [ ] File length <150 lines (split if longer)
- [ ] Cyclomatic complexity <8 per function

---

**End of Report**
