"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ReadingForm } from "@/components/readings/reading-form";
import { createReading, type ReadingFormValues } from "@/app/actions/readings";
import { getUtilityAccountsForBuilding } from "@/app/actions/utility-accounts";
import { toast } from "sonner";

export default function NewReadingPage() {
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
    return <div className="py-10 text-center text-muted-foreground">Loading utility accounts...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Add Utility Reading</h2>
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
      />
    </div>
  );
}
