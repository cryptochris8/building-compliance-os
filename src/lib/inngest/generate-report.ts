import { inngest } from './client';
import { db } from '@/lib/db';
import { buildings, organizations, complianceYears, utilityAccounts, utilityReadings, deductions, documents } from '@/lib/db/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { ComplianceReportDocument } from '@/lib/reports/compliance-report';
import type { ReportData } from '@/lib/reports/compliance-report';
import { calculateBuildingEmissions, type UtilityReadingInput } from '@/lib/emissions/calculator';
import { createClient } from '@supabase/supabase-js';

export const generateReport = inngest.createFunction(
  { id: 'generate-report', retries: 2 },
  { event: 'report/generate.requested' },
  async ({ event }) => {
    const { buildingId, year, jobId } = event.data as {
      buildingId: string;
      year: number;
      jobId: string;
    };

    // Fetch building
    const [building] = await db.select().from(buildings)
      .where(eq(buildings.id, buildingId)).limit(1);
    if (!building) throw new Error('Building not found: ' + buildingId);

    // Fetch org
    const [org] = await db.select().from(organizations)
      .where(eq(organizations.id, building.organizationId)).limit(1);

    // Fetch compliance year
    const [cy] = await db.select().from(complianceYears)
      .where(and(eq(complianceYears.buildingId, buildingId), eq(complianceYears.year, year)))
      .limit(1);
    if (!cy) throw new Error('No compliance data for year ' + year);

    // Fetch accounts + readings
    const accounts = await db.select().from(utilityAccounts)
      .where(eq(utilityAccounts.buildingId, buildingId));
    const accountTypeMap = new Map(accounts.map((a) => [a.id, a.utilityType]));

    const yearStart = year + '-01-01';
    const yearEnd = year + '-12-31';
    const readings = await db.select().from(utilityReadings)
      .where(and(
        eq(utilityReadings.buildingId, buildingId),
        sql`${utilityReadings.periodStart} >= ${yearStart}`,
        sql`${utilityReadings.periodEnd} <= ${yearEnd}`
      ));

    const deds = await db.select().from(deductions)
      .where(eq(deductions.complianceYearId, cy.id));

    const docs = await db.select().from(documents)
      .where(eq(documents.buildingId, buildingId));

    // Build emissions using actual coefficients
    const readingInputs: UtilityReadingInput[] = readings.map((r) => ({
      utilityType: accountTypeMap.get(r.utilityAccountId) || 'electricity',
      consumptionValue: Number(r.consumptionValue),
      consumptionUnit: r.consumptionUnit,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
    }));

    const emissionsCalc = calculateBuildingEmissions(readingInputs, building.jurisdictionId, year);

    const fuelTotals: Record<string, { consumption: number; unit: string }> = {};
    const monthlyData: Record<string, Record<string, number>> = {};

    for (const r of readings) {
      const utilType = accountTypeMap.get(r.utilityAccountId) || 'electricity';
      const val = Number(r.consumptionValue);
      if (!fuelTotals[utilType]) fuelTotals[utilType] = { consumption: 0, unit: r.consumptionUnit };
      fuelTotals[utilType].consumption += val;
      const month = r.periodStart.substring(0, 7);
      if (!monthlyData[month]) monthlyData[month] = {};
      const key = utilType === 'natural_gas' ? 'naturalGas' :
        utilType === 'district_steam' ? 'districtSteam' :
        utilType === 'fuel_oil_2' ? 'fuelOil2' :
        utilType === 'fuel_oil_4' ? 'fuelOil4' : 'electricity';
      monthlyData[month][key] = (monthlyData[month][key] || 0) + val;
    }

    const totalEmissions = emissionsCalc.totalEmissionsTco2e;
    const emissionsByFuel = Object.entries(fuelTotals).map(([type, data]) => ({
      utilityType: type.replace('_', ' '),
      annualConsumption: data.consumption,
      unit: data.unit,
      coefficient: 0,
      emissions: emissionsCalc.breakdownByFuel[type] || 0,
      percentOfTotal: totalEmissions > 0 ? ((emissionsCalc.breakdownByFuel[type] || 0) / totalEmissions) * 100 : 0,
    }));

    const months = [];
    for (let m = 1; m <= 12; m++) {
      const key = year + '-' + String(m).padStart(2, '0');
      const md = monthlyData[key] || {};
      months.push({
        month: key,
        electricity: md.electricity || 0,
        naturalGas: md.naturalGas || 0,
        districtSteam: md.districtSteam || 0,
        fuelOil2: md.fuelOil2 || 0,
        fuelOil4: md.fuelOil4 || 0,
      });
    }

    const allYears = await db.select().from(complianceYears)
      .where(eq(complianceYears.buildingId, buildingId))
      .orderBy(desc(complianceYears.year));
    const yearOverYear = allYears.map((y) => ({
      year: y.year,
      emissions: Number(y.totalEmissionsTco2e || 0),
      limit: Number(y.emissionsLimitTco2e || 0),
      trend: Number(y.totalEmissionsTco2e || 0) > Number(y.emissionsLimitTco2e || 0) ? 'Over' : 'Under',
    }));

    const dataSources = accounts.map((a) => ({
      accountName: a.accountNumber || 'Account',
      utilityType: a.utilityType,
      source: 'manual',
      readingCount: readings.filter((r) => r.utilityAccountId === a.id).length,
      confidence: 'confirmed',
    }));

    const reportData: ReportData = {
      building: {
        name: building.name,
        address: (building.addressLine1 ?? '') + ', ' + (building.city ?? '') + ', ' + (building.state ?? '') + ' ' + (building.zip ?? ''),
        bbl: building.bbl,
        bin: building.bin,
        occupancyType: building.occupancyType,
        grossSqft: Number(building.grossSqft),
        jurisdictionId: building.jurisdictionId,
      },
      compliance: {
        year,
        status: cy.status || 'incomplete',
        totalEmissions,
        emissionsLimit: Number(cy.emissionsLimitTco2e || 0),
        emissionsOverLimit: Number(cy.emissionsOverLimit || 0),
        penalty: Number(cy.estimatedPenaltyDollars || 0),
        completeness: Number(cy.dataCompletenessPct || 0),
        totalDeductions: Number(cy.totalDeductionsTco2e || 0),
        netEmissions: Number(cy.netEmissionsTco2e || 0),
      },
      emissionsByFuel,
      monthlyConsumption: months,
      yearOverYear,
      dataSources,
      deductions: deds.map((d) => ({
        type: d.deductionType,
        description: d.description || '',
        amount: Number(d.amountTco2e),
        verified: d.verified || false,
      })),
      documents: docs.map((d) => ({
        fileName: d.fileName,
        documentType: d.documentType || 'other',
        uploadDate: d.createdAt ? new Date(d.createdAt).toLocaleDateString() : '',
      })),
      organizationName: org?.name || 'Unknown',
      generatedAt: new Date().toISOString(),
    };

    // Render PDF
    const element = React.createElement(ComplianceReportDocument, { data: reportData });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(element as any);

    // Upload to Supabase Storage
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const safeName = building.name.replace(/[^a-zA-Z0-9]/g, '_');
    const storagePath = 'reports/' + buildingId + '/' + safeName + '_compliance_' + year + '_' + jobId + '.pdf';

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
      fileName: safeName + '_compliance_' + year + '.pdf',
    };
  }
);
