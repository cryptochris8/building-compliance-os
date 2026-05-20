"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ComplianceStatusBadge } from "@/components/ui/compliance-status-badge";
import type { ComplianceStatus } from "@/types";
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

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

export default function ReportsClient() {
  const params = useParams();
  const buildingId = params.id as string;
  const [years, setYears] = useState<ComplianceYear[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const loadHistory = useCallback(async () => {
    const history = await getReportHistory(buildingId);
    setYears(history);
    return history;
  }, [buildingId]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const history = await loadHistory();
        if (active && history.length > 0) setSelectedYear(history[0].year);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [loadHistory]);

  const handleDownload = (year: number) => {
    window.open("/api/reports/" + buildingId + "?year=" + year, "_blank");
  };

  const handleMarkSubmitted = (year: number) => {
    startTransition(async () => {
      const result = await markReportSubmitted(buildingId, year);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Report marked as submitted");
        await loadHistory();
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">Generate and download compliance reports.</p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={String(selectedYear)}
            onValueChange={(v) => setSelectedYear(parseInt(v))}
            disabled={loading || years.length === 0}
          >
            <SelectTrigger className="w-[120px]" aria-label="Report year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.length === 0 ? (
                <SelectItem value={String(new Date().getFullYear())}>
                  {new Date().getFullYear()}
                </SelectItem>
              ) : (
                years.map((y) => (
                  <SelectItem key={y.year} value={String(y.year)}>{y.year}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Button onClick={() => handleDownload(selectedYear)} disabled={loading || years.length === 0}>
            Download PDF
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader><Skeleton className="h-5 w-48" /></CardHeader>
              <CardContent><Skeleton className="h-9 w-40" /></CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4">
          {years.map((cy) => (
            <Card key={cy.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{cy.year} Compliance Report</span>
                  <div className="flex items-center gap-2">
                    <ComplianceStatusBadge status={(cy.status ?? "incomplete") as ComplianceStatus} />
                    {cy.reportSubmitted && <Badge variant="default">Submitted</Badge>}
                  </div>
                </CardTitle>
                <CardDescription>
                  Emissions: {Number(cy.totalEmissions || 0).toFixed(2)} tCO2e | Limit: {Number(cy.emissionsLimit || 0).toFixed(2)} tCO2e | Completeness: {Number(cy.completeness || 0)}%
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3">
                  <Button size="sm" onClick={() => handleDownload(cy.year)}>
                    Download PDF
                  </Button>
                  {!cy.reportSubmitted && (
                    <Button size="sm" variant="outline" onClick={() => handleMarkSubmitted(cy.year)} disabled={isPending}>
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
      )}
    </div>
  );
}
