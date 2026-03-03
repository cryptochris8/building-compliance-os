"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { createDeduction } from "@/app/actions/deductions";

interface DeductionFormProps {
  buildingId: string;
  complianceYearId: string;
  onComplete?: () => void;
}

const DEDUCTION_TYPES = [
  { value: "purchased_recs", label: "Purchased RECs" },
  { value: "onsite_renewables", label: "On-Site Renewables" },
  { value: "community_dg", label: "Community Distributed Generation" },
  { value: "other", label: "Other" },
];

export function DeductionForm({ buildingId, complianceYearId, onComplete }: DeductionFormProps) {
  const [deductionType, setDeductionType] = useState("purchased_recs");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await createDeduction({
      buildingId,
      complianceYearId,
      deductionType: deductionType as "purchased_recs" | "onsite_renewables" | "community_dg" | "other",
      description,
      amountTco2e: amount,
    });

    if (result.error) {
      setError(result.error);
    } else {
      setAmount("");
      setDescription("");
      onComplete?.();
    }
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Deduction Type</Label>
        <Select value={deductionType} onValueChange={setDeductionType}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DEDUCTION_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Amount (tCO2e)</Label>
        <Input
          type="number"
          step="0.001"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Enter amount in tCO2e"
          className="mt-1"
          required
        />
      </div>

      <div>
        <Label>Description</Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          className="mt-1"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={submitting || !amount} className="w-full">
        {submitting ? "Adding..." : "Add Deduction"}
      </Button>
    </form>
  );
}
