"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ConfirmDialog, useConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Trash2, Lock } from "lucide-react";
import { DeductionForm } from "./deduction-form";
import { deleteDeduction } from "@/app/actions/deductions";
import { toast } from "sonner";

const TYPE_LABELS: Record<string, string> = {
  purchased_recs: "Purchased RECs",
  onsite_renewables: "On-Site Renewables",
  community_dg: "Community DG",
  other: "Other",
};

interface DeductionsClientProps {
  buildingId: string;
  buildingName: string;
  selectedYear: number;
  availableYears: number[];
  complianceYearId: string | null;
  totalEmissions: number;
  totalDeductions: number;
  netEmissions: number;
  emissionsLimit: number;
  deductions: Array<{
    id: string;
    deductionType: string;
    description: string | null;
    amountTco2e: string;
    verified: boolean | null;
    createdAt: Date | null;
  }>;
  locked: boolean;
}

export function DeductionsClient({
  buildingId, buildingName, selectedYear, availableYears,
  complianceYearId, totalEmissions, totalDeductions, netEmissions,
  emissionsLimit, deductions, locked,
}: DeductionsClientProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmProps, showConfirm] = useConfirmDialog();

  const handleYearChange = (year: string) => {
    router.push("/buildings/" + buildingId + "/deductions?year=" + year);
  };

  const handleDelete = (id: string) => {
    if (!complianceYearId) return;
    showConfirm({
      title: "Delete Deduction",
      description: "Are you sure you want to delete this deduction? This will affect the compliance calculation.",
      onConfirm: async () => {
        const result = await deleteDeduction(id, buildingId, complianceYearId);
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.success("Deduction deleted");
          router.refresh();
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Deductions</h2>
          <p className="text-muted-foreground">{buildingName} - {selectedYear}</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={String(selectedYear)} onValueChange={handleYearChange}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {availableYears.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {complianceYearId && !locked && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> Add Deduction</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Deduction</DialogTitle></DialogHeader>
                <DeductionForm
                  buildingId={buildingId}
                  complianceYearId={complianceYearId}
                  onComplete={() => { setDialogOpen(false); router.refresh(); }}
                />
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {locked && (
        <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20">
          <CardContent className="flex items-center gap-2 pt-6">
            <Lock className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            <span className="text-sm text-yellow-800 dark:text-yellow-200">
              This compliance year is locked. Unlock to make changes.
            </span>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Gross Emissions</p>
            <p className="text-2xl font-bold">{totalEmissions.toFixed(2)} tCO2e</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Deductions</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">-{totalDeductions.toFixed(2)} tCO2e</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Net Emissions</p>
            <p className="text-2xl font-bold">{netEmissions.toFixed(2)} tCO2e</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Emissions Limit</p>
            <p className="text-2xl font-bold">{emissionsLimit.toFixed(2)} tCO2e</p>
          </CardContent>
        </Card>
      </div>

      {/* Deductions Table */}
      <Card>
        <CardHeader><CardTitle>Deductions List</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount (tCO2e)</TableHead>
                <TableHead>Verified</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deductions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No deductions added yet.
                  </TableCell>
                </TableRow>
              ) : (
                deductions.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <Badge variant="outline">{TYPE_LABELS[d.deductionType] || d.deductionType}</Badge>
                    </TableCell>
                    <TableCell>{d.description || "-"}</TableCell>
                    <TableCell className="text-right font-medium">{Number(d.amountTco2e).toFixed(3)}</TableCell>
                    <TableCell>
                      {d.verified ? <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">Verified</Badge> : <Badge variant="outline">Pending</Badge>}
                    </TableCell>
                    <TableCell>
                      {!locked && (
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(d.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <ConfirmDialog {...confirmProps} />
    </div>
  );
}
