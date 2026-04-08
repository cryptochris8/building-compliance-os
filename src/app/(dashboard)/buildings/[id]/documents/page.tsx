import { notFound } from "next/navigation";
import { assertBuildingAccess } from "@/lib/auth/helpers";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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

  const docs = await db.select({
    id: documents.id,
    fileName: documents.fileName,
    fileType: documents.fileType,
    fileSizeBytes: documents.fileSizeBytes,
    documentType: documents.documentType,
    createdAt: documents.createdAt,
    complianceYearId: documents.complianceYearId,
  }).from(documents).where(eq(documents.buildingId, id));

  const docRecords = docs.map((d) => ({
    id: d.id,
    fileName: d.fileName,
    fileType: d.fileType,
    fileSizeBytes: d.fileSizeBytes,
    documentType: d.documentType,
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
    complianceYear: null as number | null,
  }));

  return <DocumentsClient documents={docRecords} />;
}
