"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FUEL_LABELS: Record<string, string> = {
  electricity: "Electricity",
  natural_gas: "Natural Gas",
  district_steam: "District Steam",
  fuel_oil_2: "Fuel Oil #2",
  fuel_oil_4: "Fuel Oil #4",
};

interface WhatIfCalculatorProps {
  breakdownByFuel: Record<string, number>;
  totalEmissions: number;
  emissionsLimit: number;
  penaltyPerTon: number;
  currentPenalty: number;
}

export function WhatIfCalculator({
  breakdownByFuel,
  totalEmissions,
  emissionsLimit,
  penaltyPerTon,
  currentPenalty,
}: WhatIfCalculatorProps) {
  const fuelTypes = Object.keys(breakdownByFuel).filter(
    (k) => breakdownByFuel[k] > 0
  );

  const [reductions, setReductions] = useState<Record<string, number>>(
    Object.fromEntries(fuelTypes.map((f) => [f, 0]))
  );

  const projections = useMemo(() => {
    let newTotal = 0;
    const adjustedBreakdown: Record<string, number> = {};

    for (const [fuel, emissions] of Object.entries(breakdownByFuel)) {
      const reductionPct = reductions[fuel] || 0;
      const adjusted = emissions * (1 - reductionPct / 100);
      adjustedBreakdown[fuel] = adjusted;
      newTotal += adjusted;
    }

    const newOverLimit = Math.max(0, newTotal - emissionsLimit);
    const newPenalty = newOverLimit * penaltyPerTon;
    const savings = currentPenalty - newPenalty;
    const emissionsReduced = totalEmissions - newTotal;

    return {
      newTotal: Math.round(newTotal * 1000) / 1000,
      newOverLimit: Math.round(newOverLimit * 1000) / 1000,
      newPenalty: Math.round(newPenalty * 100) / 100,
      savings: Math.round(savings * 100) / 100,
      emissionsReduced: Math.round(emissionsReduced * 1000) / 1000,
      adjustedBreakdown,
    };
  }, [reductions, breakdownByFuel, totalEmissions, emissionsLimit, penaltyPerTon, currentPenalty]);

  const handleReductionChange = (fuel: string, value: string) => {
    const num = Math.min(50, Math.max(0, parseInt(value) || 0));
    setReductions((prev) => ({ ...prev, [fuel]: num }));
  };

  if (fuelTypes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>What-If Calculator</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No emissions data available for scenario modeling.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>What-If Calculator</CardTitle>
        <p className="text-sm text-muted-foreground">
          Adjust reduction percentages to see projected impact on emissions and penalties.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          {fuelTypes.map((fuel) => (
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
              <p className="text-xs text-muted-foreground">
                {breakdownByFuel[fuel].toFixed(3)} tCO2e {"-> "} {projections.adjustedBreakdown[fuel]?.toFixed(3)} tCO2e
              </p>
            </div>
          ))}
        </div>

        <div className="border-t pt-4">
          <h4 className="font-semibold mb-3">Projected Results</h4>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">New Total Emissions</p>
              <p className="text-xl font-bold">
                {projections.newTotal.toFixed(2)} tCO2e
              </p>
              {projections.emissionsReduced > 0 && (
                <Badge variant="default" className="bg-green-600">
                  -{projections.emissionsReduced.toFixed(2)} tCO2e
                </Badge>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">New Penalty Estimate</p>
              <p className="text-xl font-bold">
                {"$" + projections.newPenalty.toLocaleString()}
              </p>
              {projections.newPenalty < currentPenalty && (
                <Badge variant="default" className="bg-green-600">
                  Save {"$" + projections.savings.toLocaleString()}
                </Badge>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="text-xl font-bold">
                {projections.newOverLimit <= 0 ? (
                  <Badge variant="default" className="bg-green-600 text-lg px-3 py-1">Compliant</Badge>
                ) : (
                  <Badge variant="destructive" className="text-lg px-3 py-1">Over by {projections.newOverLimit.toFixed(2)}</Badge>
                )}
              </p>
            </div>
          </div>
        </div>

        {projections.savings > 0 && (
          <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <p className="text-sm text-green-800 dark:text-green-200">
              With these reductions, your emissions would drop from{" "}
              <strong>{totalEmissions.toFixed(2)} tCO2e</strong> to{" "}
              <strong>{projections.newTotal.toFixed(2)} tCO2e</strong>, saving{" "}
              <strong>{"$" + projections.savings.toLocaleString()}</strong> in annual penalties.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
