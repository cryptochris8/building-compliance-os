import { notFound } from "next/navigation";
import { assertBuildingAccess } from "@/lib/auth/helpers";
import DocumentsClient from "./documents-client";

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const access = await assertBuildingAccess(id);
  if (!access) {
    notFound();
  }

  return <DocumentsClient />;
}
