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
        <details className="mt-4">
          <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
            View data table
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Monthly utility consumption by fuel type in kBtu</caption>
              <thead>
                <tr className="border-b">
                  <th scope="col" className="py-2 text-left font-medium">Month</th>
                  <th scope="col" className="py-2 text-right font-medium">Electricity</th>
                  <th scope="col" className="py-2 text-right font-medium">Natural Gas</th>
                  <th scope="col" className="py-2 text-right font-medium">District Steam</th>
                  <th scope="col" className="py-2 text-right font-medium">Fuel Oil</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.month} className="border-b">
                    <td className="py-1">{row.month}</td>
                    <td className="py-1 text-right">{row.electricity.toLocaleString()}</td>
                    <td className="py-1 text-right">{row.natural_gas.toLocaleString()}</td>
                    <td className="py-1 text-right">{row.district_steam.toLocaleString()}</td>
                    <td className="py-1 text-right">{row.fuel_oil.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
