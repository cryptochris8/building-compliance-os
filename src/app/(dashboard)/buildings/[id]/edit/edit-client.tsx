"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BuildingForm, type BuildingFormValues } from "@/components/buildings/building-form";
import { updateBuilding, deleteBuilding } from "@/app/actions/buildings";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, useConfirmDialog } from "@/components/ui/confirm-dialog";
import { Trash2 } from "lucide-react";

export function EditBuildingClient({
  buildingId,
  defaultValues,
  buildingName,
}: {
  buildingId: string;
  defaultValues: BuildingFormValues;
  buildingName: string;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmProps, showConfirm] = useConfirmDialog();

  const handleSubmit = async (values: BuildingFormValues) => {
    setIsSubmitting(true);
    try {
      const result = await updateBuilding(buildingId, values);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Building updated successfully");
        router.push("/buildings/" + buildingId);
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    showConfirm({
      title: "Delete Building",
      description:
        "Are you sure you want to delete \"" + buildingName + "\"? This will permanently remove the building and all its utility readings, compliance data, and documents. This action cannot be undone.",
      confirmLabel: "Delete Building",
      onConfirm: async () => {
        const result = await deleteBuilding(buildingId);
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.success("Building deleted");
          router.push("/buildings");
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Buildings", href: "/buildings" },
          { label: buildingName, href: "/buildings/" + buildingId },
          { label: "Edit" },
        ]}
      />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Building</h1>
          <p className="text-muted-foreground">Update building details for {buildingName}.</p>
        </div>
        <Button variant="destructive" size="sm" onClick={handleDelete}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Building
        </Button>
      </div>
      <BuildingForm
        defaultValues={defaultValues}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        onCancel={() => router.push("/buildings/" + buildingId)}
      />
      <ConfirmDialog {...confirmProps} />
    </div>
  );
}
