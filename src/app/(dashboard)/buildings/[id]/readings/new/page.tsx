"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ReadingForm } from "@/components/readings/reading-form";
import { createReading, type ReadingFormValues } from "@/app/actions/readings";

export default function NewReadingPage() {
  const params = useParams();
  const router = useRouter();
  const buildingId = params.id as string;
  const [isSubmitting, setIsSubmitting] = useState(false);

  // TODO: Fetch actual utility accounts from the database
  const mockAccounts = [
    { id: "placeholder-elec", accountNumber: "ELEC-001", utilityType: "electricity", providerName: "Con Edison" },
    { id: "placeholder-gas", accountNumber: "GAS-001", utilityType: "natural_gas", providerName: "National Grid" },
    { id: "placeholder-steam", accountNumber: "STEAM-001", utilityType: "district_steam", providerName: "Con Edison Steam" },
  ];

  const handleSubmit = async (values: ReadingFormValues) => {
    setIsSubmitting(true);
    try {
      const result = await createReading(values);
      if (result.error) {
        alert(result.error);
      } else {
        router.push("/buildings/" + buildingId + "/readings");
      }
    } catch {
      alert("Failed to create reading");
    } finally {
      setIsSubmitting(false);
    }
  };

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
        accounts={mockAccounts}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        mode="create"
      />
    </div>
  );
}
