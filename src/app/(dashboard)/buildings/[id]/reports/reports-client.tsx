"use client";

import { useState, useEffect, useTransition } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getReportHistory, markReportSubmitted } from "@/app/actions/reports";

interface ComplianceYear {
  id: string;
  year: number;
  status: string | null;
  totalEmissions: string | null;
  emissionsLimit: string | null;
  penalty: string | null;
  completeness: string | null;
  reportSubmitted: boolean | null;
  reportSubmittedAt: Date | null;
}

export default function ReportsClient() {
  const params = useParams();
  const buildingId = params.id as string;
  const [years, setYears] = useState<ComplianceYear[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      const history = await getReportHistory(buildingId);
      setYears(history);
      if (history.length > 0) setSelectedYear(history[0].year);
    }
    load();
  }, [buildingId]);

  const handleDownload = () => {
    window.open("/api/reports/" + buildingId + "?year=" + selectedYear, "_blank");
  };

  const handleMarkSubmitted = () => {
    startTransition(async () => {
      const result = await markReportSubmitted(buildingId, selectedYear);
      if (result.error) { setMessage("Error: " + result.error); }
      else {
        setMessage("Report marked as submitted.");
        const history = await getReportHistory(buildingId);
        setYears(history);
      }
    });
  };

  function getStatusColor(status: string | null): "default" | "secondary" | "destructive" | "outline" {
    switch (status) {
      case "compliant": return "default";
      case "at_risk": return "secondary";
      case "over_limit": return "destructive";
      default: return "outline";
    }
  }

  function getStatusLabel(status: string | null) {
    switch (status) {
      case "compliant": return "Compliant";
      case "at_risk": return "At Risk";
      case "over_limit": return "Over Limit";
      default: return "Incomplete";
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold tracking-tight">Reports</h3>
          <p className="text-muted-foreground">Generate and download compliance reports.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="border rounded px-3 py-2 text-sm"
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
          >
            {years.map((y) => (
              <option key={y.year} value={y.year}>{y.year}</option>
            ))}
            {years.length === 0 && <option value={new Date().getFullYear()}>{new Date().getFullYear()}</option>}
          </select>
          <Button onClick={handleDownload} disabled={years.length === 0}>
            Download PDF
          </Button>
        </div>
      </div>

      {message && <div className="bg-muted p-3 rounded-md text-sm">{message}</div>}

      <div className="grid gap-4">
        {years.map((cy) => (
          <Card key={cy.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{cy.year} Compliance Report</span>
                <div className="flex items-center gap-2">
                  <Badge variant={getStatusColor(cy.status)}>{getStatusLabel(cy.status)}</Badge>
                  {cy.reportSubmitted && <Badge variant="default">Submitted</Badge>}
                </div>
              </CardTitle>
              <CardDescription>
                Emissions: {Number(cy.totalEmissions || 0).toFixed(2)} tCO2e | Limit: {Number(cy.emissionsLimit || 0).toFixed(2)} tCO2e | Completeness: {Number(cy.completeness || 0)}%
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <Button size="sm" onClick={() => { setSelectedYear(cy.year); handleDownload(); }}>
                  Download PDF
                </Button>
                {!cy.reportSubmitted && (
                  <Button size="sm" variant="outline" onClick={() => { setSelectedYear(cy.year); handleMarkSubmitted(); }} disabled={isPending}>
                    Mark as Submitted
                  </Button>
                )}
                {cy.reportSubmittedAt && (
                  <span className="text-xs text-muted-foreground self-center">
                    Submitted: {new Date(cy.reportSubmittedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {years.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No compliance data available. Run a compliance calculation first.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
