import { notFound } from "next/navigation";
import { assertBuildingAccess } from "@/lib/auth/helpers";
import ImportClient from "./import-client";

export default async function ImportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const access = await assertBuildingAccess(id);
  if (!access) {
    notFound();
  }

  return <ImportClient />;
}
