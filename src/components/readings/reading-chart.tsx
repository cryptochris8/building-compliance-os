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
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ChartDataPoint {
  month: string;
  electricity: number;
  natural_gas: number;
  district_steam: number;
  fuel_oil: number;
}

interface ReadingChartProps {
  data: ChartDataPoint[];
  title?: string;
}

const UTILITY_COLORS: Record<string, string> = {
  electricity: "#3b82f6",
  natural_gas: "#f97316",
  district_steam: "#a855f7",
  fuel_oil: "#ef4444",
};

export function ReadingChart({ data, title = "Monthly Consumption (kBtu)" }: ReadingChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No consumption data available. Add utility readings to see the chart.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div role="img" aria-label="Bar chart showing monthly utility consumption by fuel type in kBtu">
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis label={{ value: "kBtu", angle: -90, position: "insideLeft" }} />
            <Tooltip />
            <Legend />
            <Bar
              dataKey="electricity"
              name="Electricity"
              stackId="a"
              fill={UTILITY_COLORS.electricity}
            />
            <Bar
              dataKey="natural_gas"
              name="Natural Gas"
              stackId="a"
              fill={UTILITY_COLORS.natural_gas}
            />
            <Bar
              dataKey="district_steam"
              name="District Steam"
              stackId="a"
              fill={UTILITY_COLORS.district_steam}
            />
            <Bar
              dataKey="fuel_oil"
              name="Fuel Oil"
              stackId="a"
              fill={UTILITY_COLORS.fuel_oil}
            />
          </BarChart>
        </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
