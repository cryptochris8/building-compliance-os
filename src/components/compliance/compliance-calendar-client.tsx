"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Calendar, List, CheckSquare, RefreshCw, Lock } from "lucide-react";
import { bulkMarkSubmitted, bulkRecalculate } from "@/app/actions/compliance-workflow";
import { DeadlineCalendarView } from "./deadline-calendar";

interface ComplianceDeadlineRow {
  buildingId: string;
  buildingName: string;
  jurisdiction: string;
  jurisdictionName: string;
  year: number;
  reportDueDate: string;
  status: string;
  daysUntilDue: number;
  reportSubmitted: boolean;
  locked: boolean;
}

type StatusFilter = "all" | "overdue" | "upcoming" | "submitted";
type ViewMode = "list" | "calendar";

const STATUS_COLORS: Record<string, string> = {
  compliant: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  at_risk: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  over_limit: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  incomplete: "bg-gray-100 text-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

function getUrgencyColor(days: number, submitted: boolean): string {
  if (submitted) return "text-green-600";
  if (days < 0) return "text-red-600 font-bold";
  if (days < 30) return "text-orange-600 font-semibold";
  if (days < 60) return "text-yellow-600";
  return "text-green-600";
}

function getUrgencyBadge(days: number, submitted: boolean) {
  if (submitted) return <Badge className="bg-green-100 text-green-800">Submitted</Badge>;
  if (days < 0) return <Badge variant="destructive">Overdue</Badge>;
  if (days < 30) return <Badge className="bg-orange-100 text-orange-800">Due Soon</Badge>;
  if (days < 60) return <Badge className="bg-yellow-100 text-yellow-800">Upcoming</Badge>;
  return <Badge variant="outline">On Track</Badge>;
}

export function ComplianceCalendarClient({ deadlines }: { deadlines: ComplianceDeadlineRow[] }) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<"submit" | "recalculate" | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [sortField, setSortField] = useState<string>("daysUntilDue");
  const [sortAsc, setSortAsc] = useState(true);

  const filtered = useMemo(() => {
    let items = deadlines;
    if (statusFilter === "overdue") items = items.filter((d) => d.daysUntilDue < 0 && !d.reportSubmitted);
    else if (statusFilter === "upcoming") items = items.filter((d) => d.daysUntilDue >= 0 && d.daysUntilDue <= 60 && !d.reportSubmitted);
    else if (statusFilter === "submitted") items = items.filter((d) => d.reportSubmitted);

    const sorted = [...items].sort((a, b) => {
      let aVal: string | number = 0, bVal: string | number = 0;
      if (sortField === "buildingName") { aVal = a.buildingName; bVal = b.buildingName; }
      else if (sortField === "jurisdiction") { aVal = a.jurisdictionName; bVal = b.jurisdictionName; }
      else if (sortField === "reportDueDate") { aVal = a.reportDueDate; bVal = b.reportDueDate; }
      else if (sortField === "status") { aVal = a.status; bVal = b.status; }
      else { aVal = a.daysUntilDue; bVal = b.daysUntilDue; }
      if (typeof aVal === "string") return sortAsc ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return sorted;
  }, [deadlines, statusFilter, sortField, sortAsc]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((d) => d.buildingId + ":" + d.year)));
  };

  const handleSort = (field: string) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  const handleBulkAction = async () => {
    setBulkProcessing(true);
    const buildingIds = Array.from(selectedIds).map((key) => key.split(":")[0]);
    const year = Number(Array.from(selectedIds)[0]?.split(":")[1] || new Date().getFullYear());
    try {
      if (bulkAction === "submit") await bulkMarkSubmitted(buildingIds, year);
      else if (bulkAction === "recalculate") await bulkRecalculate(buildingIds, year);
    } catch (e) { console.error(e); }
    setBulkProcessing(false);
    setBulkDialogOpen(false);
    setSelectedIds(new Set());
  };

  const SortHeader = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <TableHead className="cursor-pointer select-none" onClick={() => handleSort(field)}>
      {children} {sortField === field ? (sortAsc ? " ^" : " v") : ""}
    </TableHead>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 border rounded-lg p-1">
          <Button variant={viewMode === "list" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("list")}>
            <List className="h-4 w-4 mr-1" /> List
          </Button>
          <Button variant={viewMode === "calendar" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("calendar")}>
            <Calendar className="h-4 w-4 mr-1" /> Calendar
          </Button>
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Filter status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="upcoming">Upcoming (60d)</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
          </SelectContent>
        </Select>
        {selectedIds.size > 0 && (
          <div className="flex gap-2 ml-auto">
            <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" onClick={() => { setBulkAction("submit"); setBulkDialogOpen(true); }}>
                  <CheckSquare className="h-4 w-4 mr-1" /> Mark Submitted ({selectedIds.size})
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Confirm Bulk Action</DialogTitle>
                  <DialogDescription>
                    {bulkAction === "submit"
                      ? "Mark " + selectedIds.size + " building(s) as submitted?"
                      : "Recalculate emissions for " + selectedIds.size + " building(s)?"}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleBulkAction} disabled={bulkProcessing}>
                    {bulkProcessing ? "Processing..." : "Confirm"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button variant="outline" size="sm" onClick={() => { setBulkAction("recalculate"); setBulkDialogOpen(true); }}>
              <RefreshCw className="h-4 w-4 mr-1" /> Recalculate ({selectedIds.size})
            </Button>
          </div>
        )}
      </div>

      {viewMode === "list" ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
                  </TableHead>
                  <SortHeader field="buildingName">Building Name</SortHeader>
                  <SortHeader field="jurisdiction">Jurisdiction</SortHeader>
                  <SortHeader field="reportDueDate">Report Due Date</SortHeader>
                  <SortHeader field="status">Status</SortHeader>
                  <SortHeader field="daysUntilDue">Days Until Due</SortHeader>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No compliance deadlines found. Add buildings and calculate compliance to see deadlines.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((d) => {
                    const key = d.buildingId + ":" + d.year;
                    return (
                      <TableRow key={key} className={d.daysUntilDue < 0 && !d.reportSubmitted ? "bg-red-50 dark:bg-red-950/10" : ""}>
                        <TableCell>
                          <input type="checkbox" checked={selectedIds.has(key)} onChange={() => toggleSelect(key)} />
                        </TableCell>
                        <TableCell>
                          <Link href={"/buildings/" + d.buildingId + "/compliance?year=" + d.year} className="font-medium hover:underline">
                            {d.buildingName}
                          </Link>
                          {d.locked && <Lock className="inline h-3 w-3 ml-1 text-muted-foreground" />}
                        </TableCell>
                        <TableCell>{d.jurisdictionName}</TableCell>
                        <TableCell>{d.reportDueDate} ({d.year})</TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[d.status] || STATUS_COLORS.incomplete}>
                            {d.status.replace("_", " ").toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className={getUrgencyColor(d.daysUntilDue, d.reportSubmitted)}>
                            {d.reportSubmitted ? "Submitted" : d.daysUntilDue < 0 ? Math.abs(d.daysUntilDue) + " days overdue" : d.daysUntilDue + " days"}
                          </span>
                        </TableCell>
                        <TableCell>{getUrgencyBadge(d.daysUntilDue, d.reportSubmitted)}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <DeadlineCalendarView deadlines={filtered} />
      )}
    </div>
  );
}
