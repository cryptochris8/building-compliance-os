"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BuildingForm, type BuildingFormValues } from "@/components/buildings/building-form";
import { createBuilding } from "@/app/actions/buildings";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/ui/breadcrumb";

export default function NewBuildingPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (values: BuildingFormValues) => {
    setIsSubmitting(true);
    try {
      const result = await createBuilding(values);
      if (result.error) {
        toast.error(result.error);
      } else if (result.success && result.building) {
        toast.success("Building created successfully");
        router.push("/buildings/" + result.building.id);
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Buildings", href: "/buildings" },
          { label: "Add Building" },
        ]}
      />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Add Building</h1>
        <p className="text-muted-foreground">
          Enter your building details to start tracking emissions compliance.
        </p>
      </div>
      <BuildingForm
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        onCancel={() => router.push("/buildings")}
      />
    </div>
  );
}
