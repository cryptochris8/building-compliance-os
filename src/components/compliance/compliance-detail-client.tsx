"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, XCircle, HelpCircle, RefreshCw } from "lucide-react";
import { FuelBreakdownChart } from "./fuel-breakdown-chart";
import { MonthlyEmissionsChart } from "./monthly-emissions-chart";
import { EmissionsTrendChart } from "./emissions-trend-chart";
import { WhatIfCalculator } from "./what-if-calculator";
import { ComplianceStatusHero } from "./compliance-status-hero";
import { DataCompletenessCard } from "./data-completeness-card";
import { EmissionsBreakdownTable } from "./emissions-breakdown-table";
import { calculateCompliance } from "@/app/actions/compliance";
import {
  calculateBuildingEmissions,
  normalizeConsumption,
} from "@/lib/emissions/calculator";
import { toast } from "sonner";
import { assessConfidenceFromData } from "@/lib/emissions/confidence-utils";

type IconComponent = React.ComponentType<{ className?: string }>;

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: IconComponent }> = {
  compliant: { label: "COMPLIANT", color: "text-green-700 dark:text-green-400", bgColor: "bg-green-100 dark:bg-green-950/30 border-green-300", icon: CheckCircle2 },
  at_risk: { label: "AT RISK", color: "text-yellow-700 dark:text-yellow-400", bgColor: "bg-yellow-100 dark:bg-yellow-950/30 border-yellow-300", icon: AlertTriangle },
  over_limit: { label: "OVER LIMIT", color: "text-red-700 dark:text-red-400", bgColor: "bg-red-100 dark:bg-red-950/30 border-red-300", icon: XCircle },
  incomplete: { label: "INCOMPLETE", color: "text-gray-700 dark:text-gray-400", bgColor: "bg-gray-100 dark:bg-gray-950/30 border-gray-300", icon: HelpCircle },
};

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
  buildingId, buildingName, occupancyType, jurisdictionId,
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
    } catch (err) {
      console.error('Failed to calculate building emissions:', err instanceof Error ? err.message : err);
    }

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

  const handleYearChange = (year: string) => {
    startTransition(() => { router.push("/buildings/" + buildingId + "/compliance?year=" + year); });
  };

  const handleRecalculate = async () => {
    setIsRecalculating(true);
    try {
      await calculateCompliance(buildingId, selectedYear);
      router.refresh();
      toast.success("Emissions recalculated successfully");
    } catch (e) {
      console.error("Recalculation failed:", e);
      toast.error("Recalculation failed. Please try again.");
    } finally {
      setIsRecalculating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Compliance</h2>
          <p className="text-muted-foreground">{buildingName} - {occupancyType}</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={String(selectedYear)} onValueChange={handleYearChange}>
            <SelectTrigger className="w-[140px]" aria-label="Select compliance year"><SelectValue /></SelectTrigger>
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
            <AlertTriangle className={"h-5 w-5 mt-0.5 " + (confidence.level === "low" ? "text-red-600 dark:text-red-400" : "text-yellow-600 dark:text-yellow-400")} />
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

      <ComplianceStatusHero
        statusConfig={statusConfig}
        totalEmissions={totalEmissions}
        emissionsLimit={emissionsLimit}
        penalty={penalty}
      />

      <DataCompletenessCard completeness={completeness} missingMonths={missingMonths} />

      <div className="grid gap-6 lg:grid-cols-2">
        <FuelBreakdownChart breakdownByFuel={fuelBreakdown} totalEmissions={totalEmissions} />
        <MonthlyEmissionsChart breakdownByMonth={monthBreakdown} breakdownByFuel={fuelBreakdown} annualLimit={emissionsLimit} year={selectedYear} />
      </div>

      <EmissionsBreakdownTable
        fuelBreakdown={fuelBreakdown}
        consumptionByFuel={consumptionByFuel}
        totalEmissions={totalEmissions}
      />

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
