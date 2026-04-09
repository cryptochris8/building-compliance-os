"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Building2, ShieldCheck, AlertTriangle, XCircle, DollarSign, Leaf,
  ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { PortfolioSummary } from "@/lib/emissions/types";
import { Pagination } from "@/components/ui/pagination";
import { STATUS_BADGES } from "@/components/ui/compliance-status-badge";

type SortKey = "name" | "grossSqft" | "status" | "totalEmissions" | "emissionsLimit" | "overUnder" | "penalty" | "completeness";

function SortIcon({ colKey, sortKey, sortDir }: { colKey: SortKey; sortKey: SortKey; sortDir: "asc" | "desc" }) {
  if (sortKey !== colKey) return <ArrowUpDown className="ml-1 h-3 w-3 inline opacity-40" />;
  return sortDir === "asc"
    ? <ArrowUp className="ml-1 h-3 w-3 inline" />
    : <ArrowDown className="ml-1 h-3 w-3 inline" />;
}

interface PortfolioDashboardClientProps {
  summary: PortfolioSummary | null;
  year: number;
}

export function PortfolioDashboardClient({ summary, year }: PortfolioDashboardClientProps) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("penalty");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const filtered = useMemo(() => {
    const buildings = summary?.buildings || [];
    let result = [...buildings];
    if (statusFilter !== "all") {
      result = result.filter((b) => b.status === statusFilter);
    }
    result.sort((a, b) => {
      let aVal: string | number = a[sortKey];
      let bVal: string | number = b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      aVal = Number(aVal) || 0;
      bVal = Number(bVal) || 0;
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    });
    return result;
  }, [summary?.buildings, statusFilter, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginatedBuildings = filtered.slice((page - 1) * pageSize, page * pageSize);

  // Reset page when filter changes
  const handleStatusFilter = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const totalBuildings = summary?.totalBuildings || 0;
  const compliant = summary?.compliantCount || 0;
  const atRisk = summary?.atRiskCount || 0;
  const overLimit = summary?.overLimitCount || 0;
  const totalPenalty = summary?.totalPenaltyExposure || 0;
  const totalEmissions = summary?.totalEmissions || 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Portfolio Dashboard</h2>
        <p className="text-muted-foreground">
          Overview of your building compliance performance for {year}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Buildings</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalBuildings}</div>
            <p className="text-xs text-muted-foreground">Managed properties</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Compliant</CardTitle>
            <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{compliant}</div>
            <Badge variant="default" className="bg-green-600 mt-1">Within limits</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">At Risk</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{atRisk}</div>
            <Badge variant="secondary" className="mt-1">Near limit</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Over Limit</CardTitle>
            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overLimit}</div>
            <Badge variant="destructive" className="mt-1">Exceeds limit</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Penalty Exposure</CardTitle>
            <DollarSign className="h-4 w-4 text-red-600 dark:text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{"$" + totalPenalty.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Estimated total penalties</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Emissions</CardTitle>
            <Leaf className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalEmissions.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">tCO2e portfolio total</p>
          </CardContent>
        </Card>
      </div>

      {/* Buildings Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Buildings Compliance Status</CardTitle>
              <CardDescription>{filtered.length} building{filtered.length !== 1 ? "s" : ""}</CardDescription>
            </div>
            <Select value={statusFilter} onValueChange={handleStatusFilter}>
              <SelectTrigger className="w-[180px]" aria-label="Filter by status"><SelectValue placeholder="Filter by status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="compliant">Compliant</SelectItem>
                <SelectItem value="at_risk">At Risk</SelectItem>
                <SelectItem value="over_limit">Over Limit</SelectItem>
                <SelectItem value="incomplete">Incomplete</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">No buildings found</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {totalBuildings === 0
                  ? "Add buildings and utility data to see compliance status."
                  : "No buildings match the selected filter."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead aria-sort={sortKey === "name" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                      <Button variant="ghost" size="sm" onClick={() => handleSort("name")} className="px-0 font-medium">
                        Building<SortIcon colKey="name" sortKey={sortKey} sortDir={sortDir} />
                      </Button>
                    </TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead aria-sort={sortKey === "grossSqft" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                      <Button variant="ghost" size="sm" onClick={() => handleSort("grossSqft")} className="px-0 font-medium">
                        Sq Ft<SortIcon colKey="grossSqft" sortKey={sortKey} sortDir={sortDir} />
                      </Button>
                    </TableHead>
                    <TableHead aria-sort={sortKey === "status" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                      <Button variant="ghost" size="sm" onClick={() => handleSort("status")} className="px-0 font-medium">
                        Status<SortIcon colKey="status" sortKey={sortKey} sortDir={sortDir} />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right" aria-sort={sortKey === "totalEmissions" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                      <Button variant="ghost" size="sm" onClick={() => handleSort("totalEmissions")} className="px-0 font-medium">
                        Emissions<SortIcon colKey="totalEmissions" sortKey={sortKey} sortDir={sortDir} />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right" aria-sort={sortKey === "emissionsLimit" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                      <Button variant="ghost" size="sm" onClick={() => handleSort("emissionsLimit")} className="px-0 font-medium">
                        Limit<SortIcon colKey="emissionsLimit" sortKey={sortKey} sortDir={sortDir} />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right" aria-sort={sortKey === "overUnder" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                      <Button variant="ghost" size="sm" onClick={() => handleSort("overUnder")} className="px-0 font-medium">
                        Over/Under<SortIcon colKey="overUnder" sortKey={sortKey} sortDir={sortDir} />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right" aria-sort={sortKey === "penalty" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                      <Button variant="ghost" size="sm" onClick={() => handleSort("penalty")} className="px-0 font-medium">
                        Penalty<SortIcon colKey="penalty" sortKey={sortKey} sortDir={sortDir} />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right" aria-sort={sortKey === "completeness" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                      <Button variant="ghost" size="sm" onClick={() => handleSort("completeness")} className="px-0 font-medium">
                        Complete<SortIcon colKey="completeness" sortKey={sortKey} sortDir={sortDir} />
                      </Button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedBuildings.map((b) => {
                    const badge = STATUS_BADGES[b.status] || STATUS_BADGES.incomplete;
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">
                          <Link href={"/buildings/" + b.id + "/compliance"} className="hover:underline">{b.name}</Link>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{b.address}</TableCell>
                        <TableCell>{b.grossSqft.toLocaleString()}</TableCell>
                        <TableCell><Badge variant="outline" className={badge.className}>{badge.label}</Badge></TableCell>
                        <TableCell className="text-right">{b.totalEmissions.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{b.emissionsLimit.toFixed(2)}</TableCell>
                        <TableCell className={"text-right " + (b.overUnder > 0 ? "text-destructive font-medium" : "text-[var(--success)]")}>
                          {b.overUnder > 0 ? "+" : ""}{b.overUnder.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {b.penalty > 0 ? <span className="text-destructive">{"$" + b.penalty.toLocaleString()}</span> : "$0"}
                        </TableCell>
                        <TableCell className="text-right">{b.completeness}%</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </CardContent>
      </Card>
    </div>
  );
}
