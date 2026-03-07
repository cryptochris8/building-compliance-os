'use server';

import { z } from 'zod';
import { db } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser, assertBuildingAccess } from '@/lib/auth/helpers';

// ============================================================
// Zod Validation Schema for Document Upload
// ============================================================

export const documentFormSchema = z.object({
  buildingId: z.string().min(1, 'Building ID is required'),
  fileName: z.string().min(1, 'File name is required'),
  fileType: z.string().min(1, 'File type is required'),
  fileSizeBytes: z.coerce.number().min(0).max(10 * 1024 * 1024, 'File must be under 10MB'),
  documentType: z.enum(['utility_bill', 'compliance_report', 'deduction_form', 'other']).default('other'),
  complianceYear: z.string().optional(),
  filePath: z.string().min(1, 'File path is required'),
});

export type DocumentFormValues = z.infer<typeof documentFormSchema>;

// ============================================================
// Upload Document (create metadata record)
// ============================================================

export async function uploadDocument(formData: DocumentFormValues) {
  const user = await getAuthUser();
  if (!user) {
    return { error: 'Unauthorized' };
  }

  const validated = documentFormSchema.safeParse(formData);
  if (!validated.success) {
    return { error: 'Validation failed', details: validated.error.flatten() };
  }

  const data = validated.data;

  // Verify building ownership
  const access = await assertBuildingAccess(data.buildingId);
  if (!access) return { error: 'Building not found or access denied' };

  try {
    const [document] = await db
      .insert(documents)
      .values({
        buildingId: data.buildingId,
        fileName: data.fileName,
        fileType: data.fileType,
        filePath: data.filePath,
        fileSizeBytes: data.fileSizeBytes,
        documentType: data.documentType,
        uploadedBy: user.id,
      })
      .returning();

    revalidatePath(`/buildings/${data.buildingId}/documents`);
    return { success: true, document };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upload document';
    return { error: message };
  }
}

// ============================================================
// Delete Document
// ============================================================

export async function deleteDocument(id: string, buildingId: string) {
  const user = await getAuthUser();
  if (!user) {
    return { error: 'Unauthorized' };
  }

  // Verify building ownership
  const access = await assertBuildingAccess(buildingId);
  if (!access) return { error: 'Building not found or access denied' };

  try {
    const [doc] = await db.select({ filePath: documents.filePath }).from(documents).where(eq(documents.id, id));
    if (doc?.filePath) {
      const supabase = await createClient();
      await supabase.storage.from('documents').remove([doc.filePath]);
    }
    await db.delete(documents).where(eq(documents.id, id));
    revalidatePath(`/buildings/${buildingId}/documents`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete document';
    return { error: message };
  }
}
