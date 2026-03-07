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
          <div role="img" aria-label="Pie chart showing emissions breakdown by fuel type">
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
          </div>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <p className="text-2xl font-bold">{totalEmissions.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">tCO2e Total</p>
            </div>
          </div>
        </div>
        <details className="mt-4">
          <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
            View data table
          </summary>
          <table className="mt-2 w-full text-sm">
            <caption className="sr-only">Emissions breakdown by fuel type</caption>
            <thead>
              <tr className="border-b">
                <th scope="col" className="text-left py-1 font-medium">Fuel Type</th>
                <th scope="col" className="text-right py-1 font-medium">Emissions (tCO2e)</th>
                <th scope="col" className="text-right py-1 font-medium">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.name} className="border-b">
                  <td className="py-1">{item.name}</td>
                  <td className="text-right py-1">{item.value.toFixed(3)}</td>
                  <td className="text-right py-1">{item.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </CardContent>
    </Card>
  );
}
