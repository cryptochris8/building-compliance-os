# Detailed Accessibility Issues - Building Compliance OS

## Format: [Severity] WCAG Criterion | File:Line | Description | Suggested Fix

---

## CRITICAL ISSUES

### [CRITICAL] 2.4.1 Bypass Blocks | src/app/layout.tsx, src/app/(dashboard)/layout.tsx
**Issue:** No skip-to-content navigation link exists. Screen reader users must read entire navigation structure on every page.

**Current Code:**
```tsx
// src/app/layout.tsx, line 54
return (
  <html lang="en">
    <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      {children}
    </body>
  </html>
);
```

**Fixed Code:**
```tsx
return (
  <html lang="en">
    <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      {/* Skip to content link - only visible on focus */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-50 focus:p-2 focus:bg-primary focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      {children}
    </body>
  </html>
);
```

Then wrap main content:
```tsx
// In (dashboard)/layout.tsx, line 124
<main id="main-content" className="flex-1 overflow-y-auto p-6">
  {children}
</main>
```

---

### [CRITICAL] 3.3.1 Error Identification | src/app/(auth)/login/page.tsx:78-80
**Issue:** Form error message not associated with inputs. Screen readers cannot link error to field.

**Current Code:**
```tsx
{error && (
  <p className="text-sm text-destructive">{error}</p>
)}
```

**Problem:** Error message has no role, not linked to inputs via aria-describedby

**Fixed Code:**
```tsx
{error && (
  <div
    role="alert"
    aria-live="polite"
    aria-atomic="true"
    className="rounded-md bg-destructive/10 border border-destructive/50 p-3"
  >
    <p id="login-error" className="text-sm text-destructive font-medium">{error}</p>
  </div>
)}

// Then in email input:
<input
  id="email"
  type="email"
  aria-describedby={error ? "login-error" : undefined}
  // ... other props
/>
```

**Also applies to:** `src/app/(auth)/signup/page.tsx:113-115`

---

### [CRITICAL] 1.4.3 Contrast (Minimum) | src/components/ui/progress.tsx:17
**Issue:** Primary color with 20% opacity may fail 4.5:1 contrast ratio.

**Current Code:**
```tsx
className={cn(
  "relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
  className
)}
```

**Problem:** On white background, oklch(0.205 0 0) / 20% opacity = ~2:1 contrast

**Fixed Code:**
```tsx
className={cn(
  "relative h-2 w-full overflow-hidden rounded-full bg-primary/30",
  // In dark mode, this needs adjustment
  "dark:bg-primary/20",
  className
)}
```

**Also check:**
- `src/components/compliance/data-completeness-card.tsx:28` - `text-amber-600`
- `src/components/compliance/portfolio-dashboard-client.tsx:257-261` - Red/green text combinations

---

### [CRITICAL] 1.1.1 Non-text Content | src/components/compliance/fuel-breakdown-chart.tsx:63
**Issue:** Chart has `role="img"` and `aria-label` but no data table fallback.

**Current Code:**
```tsx
<div role="img" aria-label="Pie chart showing emissions breakdown by fuel type">
  <ResponsiveContainer width="100%" height={350}>
    <PieChart>
      {/* Chart renders */}
    </PieChart>
  </ResponsiveContainer>
</div>
```

**Problem:** Users cannot access underlying data without interpreting visual chart

**Fixed Code:**
```tsx
<Card>
  <CardHeader>
    <CardTitle>Emissions by Fuel Type</CardTitle>
  </CardHeader>
  <CardContent>
    <details open={false}>
      <summary>View data as table</summary>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fuel Type</TableHead>
            <TableHead className="text-right">Emissions (tCO2e)</TableHead>
            <TableHead className="text-right">Percentage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((entry) => (
            <TableRow key={entry.name}>
              <TableCell>{entry.name}</TableCell>
              <TableCell className="text-right">{entry.value}</TableCell>
              <TableCell className="text-right">{entry.pct}%</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </details>

    <div role="img" aria-label="Pie chart showing emissions breakdown by fuel type">
      <ResponsiveContainer width="100%" height={350}>
        <PieChart>
          {/* Chart renders */}
        </PieChart>
      </ResponsiveContainer>
    </div>
  </CardContent>
</Card>
```

**Also applies to:**
- `src/components/compliance/monthly-emissions-chart.tsx:90`
- `src/components/compliance/emissions-trend-chart.tsx`
- `src/components/readings/reading-chart.tsx`

---

## MAJOR ISSUES

### [MAJOR] 1.1.1 Non-text Content | src/app/(dashboard)/buildings/[id]/page.tsx:88
**Issue:** Building icon has no alt text or aria-label.

**Current Code:**
```tsx
<CardTitle className="flex items-center gap-2">
  <Building2 className="h-5 w-5" />
  Building Information
</CardTitle>
```

**Fixed Code:**
```tsx
<CardTitle className="flex items-center gap-2">
  <Building2 className="h-5 w-5" aria-hidden="true" />
  Building Information
</CardTitle>
```

OR if icon conveys meaning:
```tsx
<CardTitle className="flex items-center gap-2">
  <Building2 className="h-5 w-5" aria-label="Building icon" />
  Building Information
</CardTitle>
```

**Frequency:** This affects ALL icons throughout codebase
- Icons in dashboard cards (lines 171, 181)
- Icons in compliance status hero
- Icons in navigation
- Icons in badges/badges

---

### [MAJOR] 1.3.1 Info and Relationships | Multiple pages
**Issue:** Pages lack proper heading hierarchy. No `<h1>` on many pages.

**Current Code Examples:**
```tsx
// src/app/(dashboard)/buildings/[id]/page.tsx:59
<h2 className="text-3xl font-bold tracking-tight">{building.name}</h2>

// src/components/compliance/what-if-calculator.tsx:132
<h4 className="font-semibold mb-3">Projected Results</h4>
```

**Problem:** No page-level `<h1>`, jumps from nothing to `<h2>` or `<h4>`

**Fixed Code:**
```tsx
// src/app/(dashboard)/buildings/[id]/page.tsx
export default async function BuildingDetailPage({...}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{building.name}</h1>
        <p className="text-muted-foreground">
          {building.addressLine1}, {building.city}, {building.state} {building.zip}
        </p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-2xl font-bold">Building Information</h2>
        </CardHeader>
        {/* ... */}
      </Card>
    </div>
  );
}
```

**Files needing fixes:**
- `src/app/(dashboard)/buildings/[id]/page.tsx` - No h1
- `src/app/(dashboard)/page.tsx` - Check hierarchy
- `src/app/(marketing)/calculator/page.tsx` - Check hierarchy
- `src/components/compliance/what-if-calculator.tsx` - Uses h4 without h2/h3
- `src/components/compliance/portfolio-dashboard-client.tsx` - Uses h2 without h1

---

### [MAJOR] 4.1.2 Name, Role, Value | src/components/compliance/what-if-calculator.tsx:102-122
**Issue:** Custom slider/input lacks proper ARIA attributes.

**Current Code:**
```tsx
<div key={fuel} className="space-y-2">
  <Label htmlFor={"reduction-" + fuel}>
    Reduce {FUEL_LABELS[fuel] || fuel} by
  </Label>
  <div className="flex items-center gap-2">
    <input
      type="range"
      id={"slider-" + fuel}
      min="0"
      max="50"
      value={reductions[fuel] || 0}
      onChange={(e) => handleReductionChange(fuel, e.target.value)}
      className="flex-1"
    />
    <div className="flex items-center gap-1">
      <Input
        id={"reduction-" + fuel}
        type="number"
        min="0"
        max="50"
        value={reductions[fuel] || 0}
        onChange={(e) => handleReductionChange(fuel, e.target.value)}
        className="w-16 text-center"
      />
      <span className="text-sm text-muted-foreground">%</span>
    </div>
  </div>
</div>
```

**Problems:**
1. Label htmlFor="reduction-{fuel}" targets the number input, not slider
2. Slider has no aria-label or aria-valuetext
3. Number input has no aria-label

**Fixed Code:**
```tsx
<div key={fuel} className="space-y-2">
  <Label htmlFor={"slider-" + fuel}>
    Reduce {FUEL_LABELS[fuel] || fuel} by
  </Label>
  <div className="flex items-center gap-2">
    <input
      type="range"
      id={"slider-" + fuel}
      min="0"
      max="50"
      value={reductions[fuel] || 0}
      onChange={(e) => handleReductionChange(fuel, e.target.value)}
      aria-label={`Reduce ${FUEL_LABELS[fuel]} by percentage (slider)`}
      aria-valuemin={0}
      aria-valuemax={50}
      aria-valuenow={reductions[fuel] || 0}
      aria-valuetext={`${reductions[fuel] || 0}%`}
      className="flex-1"
    />
    <div className="flex items-center gap-1">
      <Input
        id={"reduction-" + fuel}
        type="number"
        min="0"
        max="50"
        value={reductions[fuel] || 0}
        onChange={(e) => handleReductionChange(fuel, e.target.value)}
        aria-label={`Reduce ${FUEL_LABELS[fuel]} by percentage (number input)`}
        className="w-16 text-center"
      />
      <span className="text-sm text-muted-foreground" aria-hidden="true">%</span>
    </div>
  </div>
</div>
```

---

### [MAJOR] 1.3.1 Table Structure | src/components/emissions-breakdown-table.tsx:47-52
**Issue:** Table headers missing `scope` attribute.

**Current Code:**
```tsx
<TableHeader>
  <TableRow>
    <TableHead>Utility Type</TableHead>
    <TableHead className="text-right">Consumption</TableHead>
    <TableHead className="text-right">Emissions (tCO2e)</TableHead>
    <TableHead className="text-right">% of Total</TableHead>
  </TableRow>
</TableHeader>
```

**Fixed Code:**
```tsx
<TableHeader>
  <TableRow>
    <TableHead scope="col">Utility Type</TableHead>
    <TableHead scope="col" className="text-right">Consumption</TableHead>
    <TableHead scope="col" className="text-right">Emissions (tCO2e)</TableHead>
    <TableHead scope="col" className="text-right">% of Total</TableHead>
  </TableRow>
</TableHeader>
```

---

## MINOR ISSUES

### [MINOR] 2.4.7 Focus Visible | src/components/ui/breadcrumb.tsx:27
**Issue:** Link has no visible focus state.

**Current Code:**
```tsx
<Link href={item.href} className="hover:text-foreground transition-colors">
  {item.label}
</Link>
```

**Fixed Code:**
```tsx
<Link
  href={item.href}
  className="hover:text-foreground transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-primary"
>
  {item.label}
</Link>
```

---

### [MINOR] 2.4.7 Focus Visible | src/app/(dashboard)/buildings/[id]/page.tsx:168-194
**Issue:** Card links lack visible focus indicators.

**Current Code:**
```tsx
<Link href={"/buildings/" + id + "/readings"}>
  <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
    <CardContent className="pt-6 text-center">
      {/* ... */}
    </CardContent>
  </Card>
</Link>
```

**Problem:** When focused, card itself doesn't show focus ring

**Fixed Code:**
```tsx
<Link
  href={"/buildings/" + id + "/readings"}
  className="focus:outline-2 focus:outline-offset-2 focus:outline-primary rounded-lg"
>
  <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
    <CardContent className="pt-6 text-center">
      {/* ... */}
    </CardContent>
  </Card>
</Link>
```

---

### [MINOR] 4.1.3 Status Messages | src/components/compliance/what-if-calculator.tsx:131-166
**Issue:** Dynamic results update without screen reader announcement.

**Current Code:**
```tsx
<div className="border-t pt-4">
  <h4 className="font-semibold mb-3">Projected Results</h4>
  <div className="grid gap-4 md:grid-cols-3">
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">New Total Emissions</p>
      <p className="text-xl font-bold">
        {projections.newTotal.toFixed(2)} tCO2e
      </p>
    </div>
    {/* ... more results ... */}
  </div>
</div>
```

**Fixed Code:**
```tsx
<div className="border-t pt-4">
  <h3 className="font-semibold mb-3">Projected Results</h3>
  <div
    className="grid gap-4 md:grid-cols-3"
    aria-live="polite"
    aria-atomic="true"
    role="status"
  >
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">New Total Emissions</p>
      <p className="text-xl font-bold">
        {projections.newTotal.toFixed(2)} tCO2e
      </p>
    </div>
    {/* ... more results ... */}
  </div>
</div>
```

---

### [MINOR] 4.1.3 Status Messages | src/components/compliance/portfolio-dashboard-client.tsx:271
**Issue:** Pagination changes data but no screen reader announcement.

**Current Code:**
```tsx
<Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
```

**Fixed:** Wrap table in aria-live region:
```tsx
<div
  aria-live="polite"
  aria-label={`Page ${page} of ${totalPages}`}
>
  <Table>
    {/* ... table content ... */}
  </Table>
  <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
</div>
```

---

### [MINOR] 1.3.1 Semantic Structure | src/app/(dashboard)/buildings/[id]/page.tsx:168-194
**Issue:** Card wrapped in Link makes entire card clickable semantically.

**Current Code:**
```tsx
<Link href={"/buildings/" + id + "/readings"}>
  <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
    <CardContent className="pt-6 text-center">
      <Zap className="h-8 w-8 mx-auto mb-2 text-primary" />
      <p className="font-medium">View Readings</p>
      <p className="text-sm text-muted-foreground">Manage utility data</p>
    </CardContent>
  </Card>
</Link>
```

**Problem:** Whole card is technically a link, confusing for screen reader users

**Fixed Code:**
```tsx
<Card className="hover:bg-muted/50 transition-colors">
  <CardContent className="pt-6 text-center">
    <Zap className="h-8 w-8 mx-auto mb-2 text-primary" aria-hidden="true" />
    <Link href={"/buildings/" + id + "/readings"} className="font-medium hover:underline focus:outline-2 focus:outline-offset-2 focus:outline-primary">
      View Readings
    </Link>
    <p className="text-sm text-muted-foreground">Manage utility data</p>
  </CardContent>
</Card>
```

---

## SUMMARY BY FILE

### High Priority Files (Critical/Major Issues)

1. **src/app/layout.tsx** - Add skip link
2. **src/app/(auth)/login/page.tsx** - Fix error association
3. **src/app/(auth)/signup/page.tsx** - Fix error association
4. **src/app/(dashboard)/layout.tsx** - Add main landmark
5. **src/components/compliance/fuel-breakdown-chart.tsx** - Add data table fallback
6. **src/components/compliance/monthly-emissions-chart.tsx** - Add data table fallback
7. **src/components/compliance/emissions-trend-chart.tsx** - Add data table fallback
8. **src/components/readings/reading-chart.tsx** - Add data table fallback
9. **src/components/ui/progress.tsx** - Fix contrast
10. **src/components/compliance/data-completeness-card.tsx** - Fix contrast
11. **src/app/(dashboard)/buildings/[id]/page.tsx** - Fix heading hierarchy, icon labels
12. **src/components/compliance/what-if-calculator.tsx** - Fix heading, ARIA, aria-live

### Medium Priority Files (Minor Issues)

- All files with icons - Add aria-label or aria-hidden
- All pages - Audit heading hierarchy
- Link components - Add focus styles
- Table headers - Add scope attributes

