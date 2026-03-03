"use client";

import { useState, useEffect, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getPortfolioBuildings } from "@/app/actions/reports";

interface Building {
  id: string;
  name: string;
  addressLine1: string;
  city: string;
  state: string;
}

export default function BulkReportGenerator() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [year, setYear] = useState(new Date().getFullYear());
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      const blds = await getPortfolioBuildings();
      setBuildings(blds);
    }
    load();
  }, []);

  const toggleBuilding = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(buildings.map((b) => b.id)));
  };

  const deselectAll = () => {
    setSelected(new Set());
  };

  const handleBulkDownload = () => {
    startTransition(async () => {
      setMessage("Generating reports for " + selected.size + " buildings...");
      for (const buildingId of selected) {
        window.open("/api/reports/" + buildingId + "?year=" + year, "_blank");
        // Small delay between downloads
        await new Promise((r) => setTimeout(r, 500));
      }
      setMessage("Reports opened in new tabs.");
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bulk Report Generator</CardTitle>
        <CardDescription>Download compliance reports for multiple buildings at once.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Year:</label>
            <select
              className="border rounded px-3 py-1 text-sm"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
            >
              {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <Button size="sm" variant="outline" onClick={selectAll}>Select All</Button>
          <Button size="sm" variant="outline" onClick={deselectAll}>Deselect All</Button>
        </div>

        {message && <div className="bg-muted p-2 rounded text-sm">{message}</div>}

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {buildings.map((b) => (
            <label key={b.id} className="flex items-center gap-3 p-2 border rounded hover:bg-muted cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(b.id)}
                onChange={() => toggleBuilding(b.id)}
                className="rounded"
              />
              <div>
                <p className="font-medium text-sm">{b.name}</p>
                <p className="text-xs text-muted-foreground">{b.addressLine1}, {b.city}, {b.state}</p>
              </div>
            </label>
          ))}
          {buildings.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No buildings found.</p>
          )}
        </div>

        <Button
          onClick={handleBulkDownload}
          disabled={selected.size === 0 || isPending}
          className="w-full"
        >
          {isPending ? "Generating..." : "Download " + selected.size + " Reports"}
        </Button>
      </CardContent>
    </Card>
  );
}
