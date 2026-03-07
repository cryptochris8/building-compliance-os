import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const FUEL_LABELS: Record<string, string> = {
  electricity: "Electricity",
  natural_gas: "Natural Gas",
  district_steam: "District Steam",
  fuel_oil_2: "Fuel Oil #2",
  fuel_oil_4: "Fuel Oil #4",
};

interface FuelTableRow {
  fuel: string;
  label: string;
  consumption: number;
  emissions: number;
  pct: number;
}

interface EmissionsBreakdownTableProps {
  fuelBreakdown: Record<string, number>;
  consumptionByFuel: Record<string, number>;
  totalEmissions: number;
}

export function EmissionsBreakdownTable({
  fuelBreakdown,
  consumptionByFuel,
  totalEmissions,
}: EmissionsBreakdownTableProps) {
  const fuelTableData: FuelTableRow[] = Object.entries(fuelBreakdown).map(([fuel, emissions]) => ({
    fuel,
    label: FUEL_LABELS[fuel] || fuel,
    consumption: consumptionByFuel[fuel] || 0,
    emissions: Math.round(emissions * 1000) / 1000,
    pct: totalEmissions > 0 ? Math.round((emissions / totalEmissions) * 1000) / 10 : 0,
  }));

  return (
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
  );
}
