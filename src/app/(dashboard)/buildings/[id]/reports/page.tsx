import { notFound } from "next/navigation";
import { assertBuildingAccess } from "@/lib/auth/helpers";
import ReportsClient from "./reports-client";

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const access = await assertBuildingAccess(id);
  if (!access) {
    notFound();
  }

  return <ReportsClient />;
}
