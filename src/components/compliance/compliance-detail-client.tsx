"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, XCircle, HelpCircle, RefreshCw } from "lucide-react";
import { FuelBreakdownChart } from "./fuel-breakdown-chart";
import { MonthlyEmissionsChart } from "./monthly-emissions-chart";
import { EmissionsTrendChart } from "./emissions-trend-chart";
import { WhatIfCalculator } from "./what-if-calculator";
import { calculateCompliance } from "@/app/actions/compliance";
import {
  calculateBuildingEmissions,
  normalizeConsumption,
} from "@/lib/emissions/calculator";
import { assessConfidenceFromData } from "@/lib/emissions/confidence-utils";

type IconComponent = React.ComponentType<{ className?: string }>;

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: IconComponent }> = {
  compliant: { label: "COMPLIANT", color: "text-green-700 dark:text-green-400", bgColor: "bg-green-100 dark:bg-green-950/30 border-green-300", icon: CheckCircle2 },
  at_risk: { label: "AT RISK", color: "text-yellow-700 dark:text-yellow-400", bgColor: "bg-yellow-100 dark:bg-yellow-950/30 border-yellow-300", icon: AlertTriangle },
  over_limit: { label: "OVER LIMIT", color: "text-red-700 dark:text-red-400", bgColor: "bg-red-100 dark:bg-red-950/30 border-red-300", icon: XCircle },
  incomplete: { label: "INCOMPLETE", color: "text-gray-700 dark:text-gray-400", bgColor: "bg-gray-100 dark:bg-gray-950/30 border-gray-300", icon: HelpCircle },
};

const FUEL_LABELS: Record<string, string> = {
  electricity: "Electricity",
  natural_gas: "Natural Gas",
  district_steam: "District Steam",
  fuel_oil_2: "Fuel Oil #2",
  fuel_oil_4: "Fuel Oil #4",
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface ComplianceDetailClientProps {
  buildingId: string;
  buildingName: string;
  grossSqft: number;
  occupancyType: string;
  jurisdictionId: string;
  selectedYear: number;
  availableYears: number[];
  complianceData: {
    id: string;
    status: string;
    totalEmissions: number;
    emissionsLimit: number;
    emissionsOverLimit: number;
    penalty: number;
    completeness: number;
    missingMonths: string[];
  } | null;
  readings: Array<{
    id: string;
    utilityAccountId: string;
    periodStart: string;
    periodEnd: string;
    consumptionValue: string;
    consumptionUnit: string;
    confidence: string | null;
    utilityType: string;
  }>;
  allComplianceYears: Array<{ year: number; emissions: number; limit: number }>;
}

export function ComplianceDetailClient({
  buildingId, buildingName, grossSqft, occupancyType, jurisdictionId,
  selectedYear, availableYears, complianceData, readings, allComplianceYears,
}: ComplianceDetailClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [isRecalculating, setIsRecalculating] = useState(false);

  const totalEmissions = complianceData?.totalEmissions || 0;
  const emissionsLimit = complianceData?.emissionsLimit || 0;
  const penalty = complianceData?.penalty || 0;
  const completeness = complianceData?.completeness || 0;
  const status = complianceData?.status || "incomplete";
  const missingMonths = complianceData?.missingMonths || [];

  // Build fuel breakdown from readings
  const { fuelBreakdown, monthBreakdown, consumptionByFuel } = useMemo(() => {
    const readingsInput = readings.map((r) => ({
      utilityType: r.utilityType,
      consumptionValue: Number(r.consumptionValue),
      consumptionUnit: r.consumptionUnit,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
    }));

    let result = { breakdownByFuel: {} as Record<string, number>, breakdownByMonth: {} as Record<string, number> };
    try {
      result = calculateBuildingEmissions(readingsInput, jurisdictionId, selectedYear);
    } catch { /* skip */ }

    const cByFuel: Record<string, number> = {};
    for (const r of readings) {
      const normalized = normalizeConsumption(Number(r.consumptionValue), r.consumptionUnit, r.utilityType);
      cByFuel[r.utilityType] = (cByFuel[r.utilityType] || 0) + normalized.value;
    }

    return { fuelBreakdown: result.breakdownByFuel, monthBreakdown: result.breakdownByMonth, consumptionByFuel: cByFuel };
  }, [readings, jurisdictionId, selectedYear]);

  const confidence = useMemo(() => assessConfidenceFromData(
    readings.map((r) => ({ confidence: r.confidence, periodStart: r.periodStart, periodEnd: r.periodEnd })),
    selectedYear
  ), [readings, selectedYear]);

  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.incomplete;
  const StatusIcon = statusConfig.icon;

  const handleYearChange = (year: string) => {
    startTransition(() => { router.push("/buildings/" + buildingId + "/compliance?year=" + year); });
  };

  const handleRecalculate = async () => {
    setIsRecalculating(true);
    try { await calculateCompliance(buildingId, selectedYear); router.refresh(); }
    catch (e) { console.error("Recalculation failed:", e); }
    finally { setIsRecalculating(false); }
  };

  const fuelTableData = Object.entries(fuelBreakdown).map(([fuel, emissions]) => ({
    fuel, label: FUEL_LABELS[fuel] || fuel,
    consumption: consumptionByFuel[fuel] || 0,
    emissions: Math.round(emissions * 1000) / 1000,
    pct: totalEmissions > 0 ? Math.round((emissions / totalEmissions) * 1000) / 10 : 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Compliance</h2>
          <p className="text-muted-foreground">{buildingName} - {occupancyType}</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={String(selectedYear)} onValueChange={handleYearChange}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {availableYears.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleRecalculate} disabled={isRecalculating}>
            <RefreshCw className={"mr-2 h-4 w-4" + (isRecalculating ? " animate-spin" : "")} />
            {isRecalculating ? "Calculating..." : "Recalculate"}
          </Button>
        </div>
      </div>

      {confidence.level !== "high" && (
        <Card className={confidence.level === "low" ? "border-red-300 bg-red-50 dark:bg-red-950/20" : "border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20"}>
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertTriangle className={"h-5 w-5 mt-0.5 " + (confidence.level === "low" ? "text-red-600" : "text-yellow-600")} />
            <div>
              <p className={"text-sm font-medium " + (confidence.level === "low" ? "text-red-800 dark:text-red-200" : "text-yellow-800 dark:text-yellow-200")}>
                Data Confidence: {confidence.level.toUpperCase()}
              </p>
              <ul className="mt-1 text-sm text-muted-foreground list-disc list-inside">
                {confidence.reasons.map((reason, i) => (<li key={i}>{reason}</li>))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status Hero Card */}
      <Card className={"border-2 " + statusConfig.bgColor}>
        <CardContent className="pt-6">
          <div className="grid gap-6 md:grid-cols-4">
            <div className="flex items-center gap-4">
              <StatusIcon className={"h-12 w-12 " + statusConfig.color} />
              <div>
                <p className="text-sm text-muted-foreground">Compliance Status</p>
                <p className={"text-2xl font-bold " + statusConfig.color}>{statusConfig.label}</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Emissions</p>
              <p className="text-2xl font-bold">{totalEmissions.toFixed(2)} tCO2e</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Emissions Limit</p>
              <p className="text-2xl font-bold">{emissionsLimit.toFixed(2)} tCO2e</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Estimated Penalty</p>
              <p className="text-2xl font-bold text-red-600">{"$" + penalty.toLocaleString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Completeness */}
      <Card>
        <CardHeader><CardTitle>Data Completeness</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{completeness}% of months covered</span>
            <span className="text-sm text-muted-foreground">{12 - missingMonths.length}/12 months</span>
          </div>
          <Progress value={completeness} />
          {missingMonths.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="text-sm text-muted-foreground">Missing:</span>
              {missingMonths.map((m) => {
                const monthIdx = parseInt(m.split("-")[1]) - 1;
                return (
                  <Badge key={m} variant="outline" className="text-amber-600 border-amber-300">
                    {MONTH_NAMES[monthIdx]} {m.split("-")[0]}
                  </Badge>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <FuelBreakdownChart breakdownByFuel={fuelBreakdown} totalEmissions={totalEmissions} />
        <MonthlyEmissionsChart breakdownByMonth={monthBreakdown} breakdownByFuel={fuelBreakdown} annualLimit={emissionsLimit} year={selectedYear} />
      </div>

      <Card>
        <CardHeader><CardTitle>Emissions Breakdown by Fuel Type</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Utility Type</TableHead>
                <TableHead className="text-right">Consumption</TableHead>
                <TableHead className="text-right">Emissions (tCO2e)</TableHead>
                <TableHead className="text-right">% of Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fuelTableData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No emissions data. Add utility readings and recalculate.
                  </TableCell>
                </TableRow>
              ) : (
                fuelTableData.map((row) => (
                  <TableRow key={row.fuel}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell className="text-right">{row.consumption.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{row.emissions.toFixed(3)}</TableCell>
                    <TableCell className="text-right">{row.pct}%</TableCell>
                  </TableRow>
                ))
              )}
              {fuelTableData.length > 0 && (
                <TableRow className="font-bold border-t-2">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">-</TableCell>
                  <TableCell className="text-right">{totalEmissions.toFixed(3)}</TableCell>
                  <TableCell className="text-right">100%</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <EmissionsTrendChart data={allComplianceYears} />

      <WhatIfCalculator
        breakdownByFuel={fuelBreakdown}
        totalEmissions={totalEmissions}
        emissionsLimit={emissionsLimit}
        penaltyPerTon={268}
        currentPenalty={penalty}
      />
    </div>
  );
}
