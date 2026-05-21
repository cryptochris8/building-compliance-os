"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ReadingForm } from "@/components/readings/reading-form";
import { createReading } from "@/app/actions/readings";
import type { ReadingFormValues } from "@/app/actions/readings.schema";
import { getUtilityAccountsForBuilding } from "@/app/actions/utility-accounts";
import { toast } from "sonner";

export default function NewReadingClient() {
  const params = useParams();
  const router = useRouter();
  const buildingId = params.id as string;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accounts, setAccounts] = useState<
    { id: string; accountNumber: string | null; utilityType: string; providerName: string | null }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUtilityAccountsForBuilding(buildingId).then((result) => {
      if (result.accounts) {
        setAccounts(result.accounts);
      }
      setLoading(false);
    });
  }, [buildingId]);

  const handleSubmit = async (values: ReadingFormValues) => {
    setIsSubmitting(true);
    try {
      const result = await createReading(values);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Reading added successfully");
        if (result.recalcFailed) {
          toast.warning("Reading saved, but compliance recalculation failed. The summary may be stale until the next recalc.");
        }
        router.push("/buildings/" + buildingId + "/readings");
      }
    } catch (err) {
      console.error('Failed to create reading:', err);
      toast.error("Failed to create reading");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="h-9 w-64 animate-pulse rounded bg-muted" />
          <div className="h-4 w-80 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-96 w-full animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Add Utility Reading</h1>
        <p className="text-muted-foreground">
          Manually enter a utility reading for this building.
        </p>
      </div>

      <ReadingForm
        buildingId={buildingId}
        accounts={accounts}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        mode="create"
        onCancel={() => router.push("/buildings/" + buildingId + "/readings")}
      />
    </div>
  );
}
