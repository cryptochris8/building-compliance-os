"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { ReadingChart } from "@/components/readings/reading-chart";
import { deleteReading } from "@/app/actions/readings";
import { normalizeToKbtu } from "@/lib/utils/unit-conversion";

interface ReadingData {
  id: string;
  utilityAccountId: string;
  utilityType: string;
  periodStart: string;
  periodEnd: string;
  consumptionValue: string;
  consumptionUnit: string;
  costDollars: string | null;
  source: string;
  confidence: string;
}

const DEMO_READINGS: ReadingData[] = [
  { id: "1", utilityAccountId: "a1", utilityType: "electricity", periodStart: "2024-01-01", periodEnd: "2024-01-31", consumptionValue: "45000", consumptionUnit: "kwh", costDollars: "6750", source: "manual", confidence: "confirmed" },
  { id: "2", utilityAccountId: "a2", utilityType: "natural_gas", periodStart: "2024-01-01", periodEnd: "2024-01-31", consumptionValue: "1200", consumptionUnit: "therms", costDollars: "1440", source: "manual", confidence: "confirmed" },
  { id: "3", utilityAccountId: "a1", utilityType: "electricity", periodStart: "2024-02-01", periodEnd: "2024-02-29", consumptionValue: "42000", consumptionUnit: "kwh", costDollars: "6300", source: "csv_upload", confidence: "confirmed" },
  { id: "4", utilityAccountId: "a2", utilityType: "natural_gas", periodStart: "2024-02-01", periodEnd: "2024-02-29", consumptionValue: "1400", consumptionUnit: "therms", costDollars: "1680", source: "csv_upload", confidence: "estimated" },
  { id: "5", utilityAccountId: "a1", utilityType: "electricity", periodStart: "2024-03-01", periodEnd: "2024-03-31", consumptionValue: "40000", consumptionUnit: "kwh", costDollars: "6000", source: "manual", confidence: "confirmed" },
  { id: "6", utilityAccountId: "a2", utilityType: "natural_gas", periodStart: "2024-03-01", periodEnd: "2024-03-31", consumptionValue: "1100", consumptionUnit: "therms", costDollars: "1320", source: "manual", confidence: "flagged" },
];

const UTILITY_TYPE_LABELS: Record<string, string> = {
  electricity: "Electricity",
  natural_gas: "Natural Gas",
  district_steam: "District Steam",
  fuel_oil_2: "Fuel Oil #2",
  fuel_oil_4: "Fuel Oil #4",
};

const CONFIDENCE_VARIANTS: Record<string, "default" | "secondary" | "destructive"> = {
  confirmed: "default",
  estimated: "secondary",
  flagged: "destructive",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function formatNumber(val: string): string {
  return Number(val).toLocaleString("en-US");
}

export default function ReadingsPage() {
  const params = useParams();
  const buildingId = params.id as string;
  const [filterType, setFilterType] = useState<string>("all");

  const readings = DEMO_READINGS;

  const filteredReadings = filterType === "all"
    ? readings
    : readings.filter((r) => r.utilityType === filterType);

  // Build chart data
  const chartDataMap = new Map<string, { month: string; electricity: number; natural_gas: number; district_steam: number; fuel_oil: number }>();

  for (const r of readings) {
    const monthKey = r.periodStart.substring(0, 7);
    const monthLabel = new Date(r.periodStart + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "2-digit" });

    if (!chartDataMap.has(monthKey)) {
      chartDataMap.set(monthKey, { month: monthLabel, electricity: 0, natural_gas: 0, district_steam: 0, fuel_oil: 0 });
    }

    const point = chartDataMap.get(monthKey)!;
    const kbtu = normalizeToKbtu(Number(r.consumptionValue), r.consumptionUnit, r.utilityType);

    if (r.utilityType === "electricity") point.electricity += kbtu;
    else if (r.utilityType === "natural_gas") point.natural_gas += kbtu;
    else if (r.utilityType === "district_steam") point.district_steam += kbtu;
    else point.fuel_oil += kbtu;
  }

  const chartData = Array.from(chartDataMap.values());

  const subtotals = readings.reduce((acc, r) => {
    const kbtu = normalizeToKbtu(Number(r.consumptionValue), r.consumptionUnit, r.utilityType);
    acc[r.utilityType] = (acc[r.utilityType] || 0) + kbtu;
    return acc;
  }, {} as Record<string, number>);

  const handleDelete = async (readingId: string) => {
    if (confirm("Are you sure you want to delete this reading?")) {
      await deleteReading(readingId, buildingId);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Utility Readings</h2>
          <p className="text-muted-foreground">
            View and manage utility consumption data for this building.
          </p>
        </div>
        <Link href={"/buildings/" + buildingId + "/readings/new"}>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Reading
          </Button>
        </Link>
      </div>

      <ReadingChart data={chartData} />

      <div className="grid gap-4 md:grid-cols-4">
        {Object.entries(subtotals).map(([type, total]) => (
          <Card key={type}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{UTILITY_TYPE_LABELS[type] || type}</p>
              <p className="text-2xl font-bold">{Math.round(total).toLocaleString()} kBtu</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Utility Types</SelectItem>
            <SelectItem value="electricity">Electricity</SelectItem>
            <SelectItem value="natural_gas">Natural Gas</SelectItem>
            <SelectItem value="district_steam">District Steam</SelectItem>
            <SelectItem value="fuel_oil_2">Fuel Oil #2</SelectItem>
            <SelectItem value="fuel_oil_4">Fuel Oil #4</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reading History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Utility Type</TableHead>
                <TableHead>Consumption</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReadings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No readings found. Add your first utility reading to get started.
                  </TableCell>
                </TableRow>
              ) : (
                filteredReadings.map((reading) => (
                  <TableRow key={reading.id}>
                    <TableCell>{formatDate(reading.periodStart)}</TableCell>
                    <TableCell>{UTILITY_TYPE_LABELS[reading.utilityType] || reading.utilityType}</TableCell>
                    <TableCell>{formatNumber(reading.consumptionValue)} {reading.consumptionUnit}</TableCell>
                    <TableCell>{reading.costDollars ? "$" + formatNumber(reading.costDollars) : "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{reading.source.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={CONFIDENCE_VARIANTS[reading.confidence] || "default"}>
                        {reading.confidence}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(reading.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
