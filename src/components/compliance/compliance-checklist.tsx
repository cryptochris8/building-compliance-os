"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { updateChecklist } from "@/app/actions/compliance-workflow";
import { toast } from "sonner";

interface ChecklistProps {
  buildingId: string;
  year: number;
  dataCompletenessPct: number;
  hasUtilityAccounts: boolean;
  hasEmissionsCalculated: boolean;
  hasComplianceReport: boolean;
  hasEvidenceDocuments: boolean;
  checklistState: Record<string, boolean | string> | null;
  locked: boolean;
}

interface ChecklistStep {
  key: string;
  label: string;
  autoChecked: boolean;
  actionLabel?: string;
  actionHref?: string;
}

export function ComplianceChecklist({
  buildingId, year, dataCompletenessPct, hasUtilityAccounts,
  hasEmissionsCalculated, hasComplianceReport, hasEvidenceDocuments,
  checklistState, locked,
}: ChecklistProps) {
  const [state, setState] = useState<Record<string, boolean | string>>(checklistState || {});
  const [, startTransition] = useTransition();

  const steps: ChecklistStep[] = [
    {
      key: "utility_data_complete",
      label: "Utility data complete (>= 95%)",
      autoChecked: dataCompletenessPct >= 95,
      actionLabel: "Add readings",
      actionHref: "/buildings/" + buildingId + "/readings/new",
    },
    {
      key: "utility_accounts_registered",
      label: "All utility accounts registered",
      autoChecked: hasUtilityAccounts,
      actionLabel: "Add accounts",
      actionHref: "/buildings/" + buildingId,
    },
    {
      key: "emissions_calculated",
      label: "Emissions calculated",
      autoChecked: hasEmissionsCalculated,
      actionLabel: "Calculate",
      actionHref: "/buildings/" + buildingId + "/compliance?year=" + year,
    },
    {
      key: "calculations_verified",
      label: "Calculations verified",
      autoChecked: false,
    },
    {
      key: "report_generated",
      label: "Report generated",
      autoChecked: hasComplianceReport,
      actionLabel: "Upload report",
      actionHref: "/buildings/" + buildingId + "/documents",
    },
    {
      key: "report_submitted",
      label: "Report submitted",
      autoChecked: false,
    },
    {
      key: "evidence_uploaded",
      label: "Evidence documents uploaded",
      autoChecked: hasEvidenceDocuments,
      actionLabel: "Upload documents",
      actionHref: "/buildings/" + buildingId + "/documents",
    },
  ];

  const getStepChecked = (step: ChecklistStep): boolean => {
    if (step.autoChecked) return true;
    return !!state[step.key];
  };

  const completedCount = steps.filter(getStepChecked).length;
  const progressPct = Math.round((completedCount / steps.length) * 100);

  const handleToggle = (key: string) => {
    if (locked) return;
    const next = { ...state, [key]: !state[key] };
    setState(next);
    startTransition(async () => {
      const result = await updateChecklist(buildingId, year, next);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Checklist updated");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compliance Checklist - {year}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>{completedCount}/{steps.length} steps completed</span>
            <span>{progressPct}%</span>
          </div>
          <Progress value={progressPct} />
        </div>

        <div className="space-y-2">
          {steps.map((step, i) => {
            const checked = getStepChecked(step);
            const isManual = !step.autoChecked;
            return (
              <div
                key={step.key}
                className={"flex items-center justify-between p-3 rounded-lg border " + (checked ? "bg-green-50 dark:bg-green-950/20 border-green-200" : "bg-card")}
              >
                <div className="flex items-center gap-3">
                  {isManual && !locked ? (
                    <button
                      onClick={() => handleToggle(step.key)}
                      className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
                      aria-label={(checked ? "Uncheck" : "Check") + " " + step.label}
                    >
                      {checked
                        ? <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                        : <Circle className="h-5 w-5 text-muted-foreground" />}
                    </button>
                  ) : (
                    checked
                      ? <CheckCircle2 className="h-5 w-5 text-green-600" />
                      : <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                  <span className={"text-sm " + (checked ? "text-green-700 dark:text-green-400" : "")}>
                    {i + 1}. {step.label}
                  </span>
                </div>
                {!checked && step.actionHref && (
                  <Link href={step.actionHref}>
                    <Button variant="ghost" size="sm">
                      {step.actionLabel} <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
