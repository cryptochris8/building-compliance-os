"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const FUEL_COLORS: Record<string, string> = {
  electricity: "#3b82f6",
  natural_gas: "#f97316",
  district_steam: "#8b5cf6",
  fuel_oil_2: "#ef4444",
  fuel_oil_4: "#f43f5e",
};

const FUEL_LABELS: Record<string, string> = {
  electricity: "Electricity",
  natural_gas: "Natural Gas",
  district_steam: "District Steam",
  fuel_oil_2: "Fuel Oil #2",
  fuel_oil_4: "Fuel Oil #4",
};

interface FuelBreakdownChartProps {
  breakdownByFuel: Record<string, number>;
  totalEmissions: number;
}

export function FuelBreakdownChart({ breakdownByFuel, totalEmissions }: FuelBreakdownChartProps) {
  const data = Object.entries(breakdownByFuel)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({
      name: FUEL_LABELS[key] || key,
      value: Math.round(value * 1000) / 1000,
      color: FUEL_COLORS[key] || "#94a3b8",
      pct: totalEmissions > 0 ? Math.round((value / totalEmissions) * 1000) / 10 : 0,
    }));

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Emissions by Fuel Type</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No emissions data available.</p>
        </CardContent>
      </Card>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderCustomLabel = (props: any) => {
    const entry = data.find((d) => d.name === props.name);
    return (entry?.name || "") + " " + (entry?.pct || 0) + "%";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Emissions by Fuel Type</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <ResponsiveContainer width="100%" height={350}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={120}
                paddingAngle={2}
                dataKey="value"
                label={renderCustomLabel}
              >
                {data.map((entry, index) => (
                  <Cell key={"cell-" + index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [(Number(value) || 0).toFixed(3) + " tCO2e", ""]}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <p className="text-2xl font-bold">{totalEmissions.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">tCO2e Total</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
