"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

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

interface MonthlyEmissionsChartProps {
  breakdownByMonth: Record<string, number>;
  breakdownByFuel: Record<string, number>;
  annualLimit: number;
  year: number;
  monthlyDetailByFuel?: Record<string, Record<string, number>>;
}

export function MonthlyEmissionsChart({
  breakdownByMonth,
  annualLimit,
  year,
  monthlyDetailByFuel,
}: MonthlyEmissionsChartProps) {
  const monthlyLimit = annualLimit / 12;
  const fuelTypes = monthlyDetailByFuel
    ? Object.keys(monthlyDetailByFuel)
    : [];

  const data = MONTH_NAMES.map((name, i) => {
    const monthKey = year + "-" + String(i + 1).padStart(2, "0");
    const entry: Record<string, string | number> = { month: name };

    if (monthlyDetailByFuel && fuelTypes.length > 0) {
      for (const fuel of fuelTypes) {
        entry[fuel] = Math.round((monthlyDetailByFuel[fuel]?.[monthKey] || 0) * 1000) / 1000;
      }
    } else {
      entry.emissions = Math.round((breakdownByMonth[monthKey] || 0) * 1000) / 1000;
    }

    return entry;
  });

  if (Object.keys(breakdownByMonth).length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Monthly Emissions Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No monthly data available.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly Emissions Trend ({year})</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis label={{ value: "tCO2e", angle: -90, position: "insideLeft" }} />
            <Tooltip />
            <Legend />
            {fuelTypes.length > 0 ? (
              fuelTypes.map((fuel) => (
                <Bar
                  key={fuel}
                  dataKey={fuel}
                  name={FUEL_LABELS[fuel] || fuel}
                  stackId="a"
                  fill={FUEL_COLORS[fuel] || "#94a3b8"}
                />
              ))
            ) : (
              <Bar dataKey="emissions" name="Emissions" stackId="a" fill="#3b82f6" />
            )}
            <ReferenceLine
              y={monthlyLimit}
              stroke="#dc2626"
              strokeDasharray="5 5"
              label={{ value: "Monthly Limit", position: "right", fill: "#dc2626", fontSize: 12 }}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
