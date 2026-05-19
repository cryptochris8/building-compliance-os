import { inngest } from './client';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { ComplianceReportDocument } from '@/lib/reports/compliance-report';
import { assembleReportData } from '@/lib/reports/assemble-report-data';
import { getReportWatermark } from '@/lib/billing/watermark';
import { createServiceClient } from '@/lib/supabase/service';

export const generateReport = inngest.createFunction(
  { id: 'generate-report', retries: 2 },
  { event: 'report/generate.requested' },
  async ({ event }) => {
    const { buildingId, year, jobId, orgId } = event.data as {
      buildingId: string;
      year: number;
      jobId: string;
      orgId: string;
    };

    const result = await assembleReportData(buildingId, year);
    if (!result.data) {
      throw new Error(result.error);
    }

    const { data: reportData, buildingName } = result;

    // Trial subscriptions produce a watermarked, unfilable PDF; paid plans produce a clean one.
    const watermark = await getReportWatermark(orgId);

    // Render PDF
    const element = React.createElement(ComplianceReportDocument, { data: reportData, watermark });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(element as any);

    // Upload to Supabase Storage
    const supabase = createServiceClient();

    const safeName = buildingName.replace(/[^a-zA-Z0-9]/g, '_');
    const prefix = watermark ? 'TRIAL_' : '';
    const storagePath = 'reports/' + buildingId + '/' + prefix + safeName + '_compliance_' + year + '_' + jobId + '.pdf';

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, new Uint8Array(pdfBuffer), {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      throw new Error('Failed to upload report: ' + uploadError.message);
    }

    // Get signed URL (valid for 1 hour)
    const { data: urlData } = await supabase.storage
      .from('documents')
      .createSignedUrl(storagePath, 3600);

    return {
      jobId,
      buildingId,
      year,
      storagePath,
      downloadUrl: urlData?.signedUrl || null,
      fileName: prefix + safeName + '_compliance_' + year + '.pdf',
    };
  }
);
