import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Plus, Building2, Zap, Flame, Droplets } from "lucide-react";
import { detectGaps, getMonthName } from "@/lib/validation/gap-detector";

const DEMO_BUILDING = {
  name: "350 Fifth Avenue",
  addressLine1: "350 Fifth Avenue",
  city: "New York",
  state: "NY",
  zip: "10118",
  grossSqft: "2768591",
  occupancyType: "B - Business",
  yearBuilt: 1931,
  jurisdictionId: "nyc-ll97",
};

const DEMO_ACCOUNTS = [
  { id: "a1", utilityType: "electricity" },
  { id: "a2", utilityType: "natural_gas" },
];

const DEMO_READINGS = [
  { utilityAccountId: "a1", periodStart: "2024-01-01", periodEnd: "2024-01-31" },
  { utilityAccountId: "a1", periodStart: "2024-02-01", periodEnd: "2024-02-29" },
  { utilityAccountId: "a1", periodStart: "2024-03-01", periodEnd: "2024-03-31" },
  { utilityAccountId: "a2", periodStart: "2024-01-01", periodEnd: "2024-01-31" },
  { utilityAccountId: "a2", periodStart: "2024-02-01", periodEnd: "2024-02-29" },
  { utilityAccountId: "a2", periodStart: "2024-03-01", periodEnd: "2024-03-31" },
];

const UTILITY_LABELS: Record<string, string> = {
  electricity: "Electricity",
  natural_gas: "Natural Gas",
  district_steam: "District Steam",
  fuel_oil_2: "Fuel Oil #2",
  fuel_oil_4: "Fuel Oil #4",
};

export default async function BuildingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const building = DEMO_BUILDING;
  const currentYear = new Date().getFullYear();

  const gapReport = detectGaps(id, currentYear, DEMO_ACCOUNTS, DEMO_READINGS);
  const totalMissingMonths = gapReport.accounts.reduce(
    (sum, a) => sum + a.missingMonths.length, 0
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">{building.name}</h2>
        <p className="text-muted-foreground">
          {building.addressLine1}, {building.city}, {building.state} {building.zip}
        </p>
      </div>

      {gapReport.overallCompleteness < 100 && (
        <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex items-center gap-3 pt-6">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Missing utility data for {totalMissingMonths} account-months.
                Your compliance calculation may be incomplete.
              </p>
              <Link
                href={"/buildings/" + id + "/readings/new"}
                className="text-sm text-amber-700 underline dark:text-amber-300"
              >
                Add missing readings
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Building Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Gross Square Footage</p>
              <p className="text-lg font-semibold">{Number(building.grossSqft).toLocaleString()} sq ft</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Occupancy Type</p>
              <p className="text-lg font-semibold">{building.occupancyType}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Year Built</p>
              <p className="text-lg font-semibold">{building.yearBuilt || "N/A"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Jurisdiction</p>
              <Badge variant="outline">{building.jurisdictionId}</Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Building ID</p>
              <p className="text-sm font-mono">{id}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Completeness - {currentYear}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Overall Completeness</span>
              <span className="text-sm text-muted-foreground">{gapReport.overallCompleteness}%</span>
            </div>
            <Progress value={gapReport.overallCompleteness} />
          </div>

          {gapReport.accounts.map((account) => {
            const label = UTILITY_LABELS[account.utilityType] || account.utilityType;
            return (
              <div key={account.accountId} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">{account.completeness}%</span>
                </div>
                <Progress value={account.completeness} />
                {account.missingMonths.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {account.missingMonths.map((month) => (
                      <Link key={month} href={"/buildings/" + id + "/readings/new"}>
                        <Badge variant="outline" className="cursor-pointer hover:bg-muted">
                          <Plus className="h-3 w-3 mr-1" />
                          {getMonthName(month)}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {gapReport.accounts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No utility accounts found. Add utility accounts and readings to track completeness.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Link href={"/buildings/" + id + "/readings"}>
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardContent className="pt-6 text-center">
              <Zap className="h-8 w-8 mx-auto mb-2 text-primary" />
              <p className="font-medium">View Readings</p>
              <p className="text-sm text-muted-foreground">Manage utility data</p>
            </CardContent>
          </Card>
        </Link>
        <Link href={"/buildings/" + id + "/import"}>
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardContent className="pt-6 text-center">
              <Flame className="h-8 w-8 mx-auto mb-2 text-orange-500" />
              <p className="font-medium">Import CSV</p>
              <p className="text-sm text-muted-foreground">Bulk upload data</p>
            </CardContent>
          </Card>
        </Link>
        <Link href={"/buildings/" + id + "/documents"}>
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardContent className="pt-6 text-center">
              <Droplets className="h-8 w-8 mx-auto mb-2 text-blue-500" />
              <p className="font-medium">Documents</p>
              <p className="text-sm text-muted-foreground">Evidence vault</p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
