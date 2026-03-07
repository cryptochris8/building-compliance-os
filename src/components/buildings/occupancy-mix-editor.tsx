"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, AlertTriangle } from "lucide-react";

interface OccupancyMixEntry {
  type: string;
  sqft: number;
}

interface OccupancyMixEditorProps {
  grossSqft: number;
  initialMix: OccupancyMixEntry[];
  onSave: (mix: OccupancyMixEntry[]) => void;
}

const OCCUPANCY_TYPES = [
  "A - Assembly",
  "B - Business",
  "E - Educational",
  "F - Factory",
  "H - High Hazard",
  "I-1 - Institutional",
  "I-2 - Institutional (Hospital)",
  "I-3 - Institutional (Detention)",
  "I-4 - Institutional (Day Care)",
  "M - Mercantile",
  "R-1 - Residential (Hotel)",
  "R-2 - Residential (Multi-family)",
  "S - Storage",
  "U - Utility",
];

export function OccupancyMixEditor({ grossSqft, initialMix, onSave }: OccupancyMixEditorProps) {
  const [mix, setMix] = useState<OccupancyMixEntry[]>(
    initialMix.length > 0 ? initialMix : [{ type: OCCUPANCY_TYPES[0], sqft: 0 }]
  );

  const totalMixSqft = mix.reduce((sum, e) => sum + e.sqft, 0);
  const difference = Math.abs(totalMixSqft - grossSqft);
  const isValid = difference <= 1;

  const addEntry = () => {
    setMix([...mix, { type: OCCUPANCY_TYPES[0], sqft: 0 }]);
  };

  const removeEntry = (index: number) => {
    setMix(mix.filter((_, i) => i !== index));
  };

  const updateEntry = (index: number, field: "type" | "sqft", value: string | number) => {
    const next = [...mix];
    if (field === "sqft") next[index] = { ...next[index], sqft: Number(value) };
    else next[index] = { ...next[index], type: value as string };
    setMix(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Occupancy Mix (Mixed-Use Building)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Total building area: {grossSqft.toLocaleString()} sqft. Allocate sqft to each occupancy type.
        </p>

        {mix.map((entry, i) => (
          <div key={i} className="flex items-center gap-3">
            <Select value={entry.type} onValueChange={(v) => updateEntry(i, "type", v)}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OCCUPANCY_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              className="w-32"
              value={entry.sqft || ""}
              onChange={(e) => updateEntry(i, "sqft", e.target.value)}
              placeholder="sqft"
            />
            {mix.length > 1 && (
              <Button variant="ghost" size="icon" onClick={() => removeEntry(i)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}

        <Button variant="outline" size="sm" onClick={addEntry}>
          <Plus className="h-4 w-4 mr-1" /> Add Occupancy Type
        </Button>

        <div className={"flex items-center gap-2 p-3 rounded-lg border " + (isValid ? "bg-green-50 border-green-200 dark:bg-green-950/20" : "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20")}>
          {!isValid && <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />}
          <span className="text-sm">
            Total allocated: {totalMixSqft.toLocaleString()} / {grossSqft.toLocaleString()} sqft
            {!isValid && " (difference: " + difference.toLocaleString() + " sqft)"}
          </span>
        </div>

        <Button onClick={() => onSave(mix)} disabled={!isValid} className="w-full">
          Save Occupancy Mix
        </Button>
      </CardContent>
    </Card>
  );
}
