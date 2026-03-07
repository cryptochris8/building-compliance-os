"use client";

import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  ComposedChart,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface YearDataPoint {
  year: number;
  emissions: number;
  limit: number;
}

interface EmissionsTrendChartProps {
  data: YearDataPoint[];
}

export function EmissionsTrendChart({ data }: EmissionsTrendChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Emissions Trend (Year-over-Year)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No multi-year data available yet. Emissions trends will appear as more years of data are added.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Add an overLimit field for shading
  const chartData = data.map((d) => ({
    ...d,
    overLimit: d.emissions > d.limit ? d.emissions : null,
    yearLabel: String(d.year),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Emissions Trend (Year-over-Year)</CardTitle>
      </CardHeader>
      <CardContent>
        <div role="img" aria-label="Line chart showing emissions trend compared to limits over years">
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="yearLabel" />
            <YAxis label={{ value: "tCO2e", angle: -90, position: "insideLeft" }} />
            <Tooltip formatter={(value) => [(Number(value) || 0).toFixed(2) + " tCO2e", ""]} />
            <Legend />
            <Area
              type="monotone"
              dataKey="overLimit"
              name="Over Limit"
              fill="#fee2e2"
              stroke="none"
              fillOpacity={0.6}
            />
            <Line
              type="monotone"
              dataKey="emissions"
              name="Actual Emissions"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ fill: "#3b82f6", r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="limit"
              name="Emissions Limit"
              stroke="#dc2626"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ fill: "#dc2626", r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
