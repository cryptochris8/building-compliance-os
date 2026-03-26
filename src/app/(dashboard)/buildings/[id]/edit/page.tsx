import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { buildings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { assertBuildingAccess, WRITE_ROLES } from "@/lib/auth/helpers";
import { EditBuildingClient } from "./edit-client";

export default async function EditBuildingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const access = await assertBuildingAccess(id, WRITE_ROLES);
  if (!access) redirect("/buildings");

  const [building] = await db
    .select()
    .from(buildings)
    .where(eq(buildings.id, id))
    .limit(1);

  if (!building) redirect("/buildings");

  const defaultValues = {
    name: building.name,
    addressLine1: building.addressLine1,
    addressLine2: building.addressLine2 ?? "",
    city: building.city,
    state: building.state,
    zip: building.zip,
    borough: building.borough ?? "",
    bbl: building.bbl ?? "",
    bin: building.bin ?? "",
    grossSqft: String(building.grossSqft),
    yearBuilt: building.yearBuilt ? String(building.yearBuilt) : "",
    occupancyType: building.occupancyType,
    jurisdictionId: building.jurisdictionId,
    notes: building.notes ?? "",
  };

  return (
    <EditBuildingClient buildingId={id} defaultValues={defaultValues} buildingName={building.name} />
  );
}
