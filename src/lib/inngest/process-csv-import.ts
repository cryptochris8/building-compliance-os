import { inngest } from './client';
import { db } from '@/lib/db';
import { importJobs, utilityAccounts, utilityReadings } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

const VALID_UTILITY_TYPES = ["electricity", "natural_gas", "district_steam", "fuel_oil_2", "fuel_oil_4"];
const VALID_UNITS = ["kwh", "therms", "kbtu", "gallons"];

function isValidDate(dateStr: string): boolean {
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

export const processCsvImport = inngest.createFunction(
  { id: 'process-csv-import', retries: 1 },
  { event: 'csv/import.requested' },
  async ({ event }) => {
    const { jobId, buildingId, rows, parseErrors } = event.data as {
      jobId: string;
      buildingId: string;
      rows: Record<string, string>[];
      parseErrors: { row: number; message: string }[];
    };

    let rowsImported = 0;
    let rowsFailed = 0;
    const errorLog: { row: number; message: string }[] = [...parseErrors];

    try {
      // Pre-fetch all utility accounts for this building to avoid N+1 queries
      const existingAccountsList = await db
        .select()
        .from(utilityAccounts)
        .where(eq(utilityAccounts.buildingId, buildingId));

      // Build a lookup map: "utilityType|accountNumber" -> accountId
      const accountCache = new Map<string, string>();
      for (const a of existingAccountsList) {
        accountCache.set(a.utilityType + '|' + (a.accountNumber || ''), a.id);
        // Also cache by type-only for fallback matching
        if (!accountCache.has(a.utilityType + '|')) {
          accountCache.set(a.utilityType + '|', a.id);
        }
      }

      // Validate all rows first, then batch insert valid ones
      interface ValidatedRow {
        utilityType: "electricity" | "natural_gas" | "district_steam" | "fuel_oil_2" | "fuel_oil_4";
        accountNumber: string | null;
        periodStart: string;
        periodEnd: string;
        consumptionValue: number;
        unit: string;
        costUsd: number | null;
        rowNum: number;
      }
      const validatedRows: ValidatedRow[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        const utilityType = row.utility_type?.toLowerCase().trim();
        if (!VALID_UTILITY_TYPES.includes(utilityType)) {
          errorLog.push({ row: rowNum, message: "Invalid utility_type: " + row.utility_type });
          rowsFailed++;
          continue;
        }

        if (!isValidDate(row.period_start)) {
          errorLog.push({ row: rowNum, message: "Invalid period_start date: " + row.period_start });
          rowsFailed++;
          continue;
        }
        if (!isValidDate(row.period_end)) {
          errorLog.push({ row: rowNum, message: "Invalid period_end date: " + row.period_end });
          rowsFailed++;
          continue;
        }

        // Validate period_start < period_end
        if (new Date(row.period_start) >= new Date(row.period_end)) {
          errorLog.push({ row: rowNum, message: "period_start must be before period_end" });
          rowsFailed++;
          continue;
        }

        const consumptionValue = parseFloat(row.consumption_value);
        if (isNaN(consumptionValue) || consumptionValue < 0) {
          errorLog.push({ row: rowNum, message: "Invalid consumption_value: " + row.consumption_value });
          rowsFailed++;
          continue;
        }

        const unit = row.consumption_unit?.toLowerCase().trim();
        if (!VALID_UNITS.includes(unit)) {
          errorLog.push({ row: rowNum, message: "Invalid consumption_unit: " + row.consumption_unit });
          rowsFailed++;
          continue;
        }

        const accountNumber = row.account_number?.trim() || null;
        const costUsd = row.cost_usd ? parseFloat(row.cost_usd) : null;

        validatedRows.push({
          utilityType: utilityType as ValidatedRow['utilityType'],
          accountNumber,
          periodStart: row.period_start,
          periodEnd: row.period_end,
          consumptionValue,
          unit,
          costUsd,
          rowNum,
        });
      }

      // Resolve account IDs for validated rows, creating accounts as needed
      const rowsWithAccounts: Array<ValidatedRow & { accountId: string }> = [];
      for (const vr of validatedRows) {
        const cacheKey = vr.accountNumber
          ? vr.utilityType + '|' + vr.accountNumber
          : vr.utilityType + '|';

        let accountId = accountCache.get(cacheKey);
        if (!accountId && vr.accountNumber) {
          // Try fallback by type-only
          accountId = accountCache.get(vr.utilityType + '|');
        }

        if (!accountId) {
          try {
            const [newAccount] = await db.insert(utilityAccounts).values({
              buildingId,
              utilityType: vr.utilityType,
              accountNumber: vr.accountNumber,
            }).returning();
            accountId = newAccount.id;
            accountCache.set(vr.utilityType + '|' + (vr.accountNumber || ''), accountId);
            if (!accountCache.has(vr.utilityType + '|')) {
              accountCache.set(vr.utilityType + '|', accountId);
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to create account";
            errorLog.push({ row: vr.rowNum, message: msg });
            rowsFailed++;
            continue;
          }
        }

        rowsWithAccounts.push({ ...vr, accountId });
      }

      // Batch insert readings in groups of 100
      const BATCH_SIZE = 100;
      for (let i = 0; i < rowsWithAccounts.length; i += BATCH_SIZE) {
        const batch = rowsWithAccounts.slice(i, i + BATCH_SIZE);
        try {
          await db.insert(utilityReadings).values(
            batch.map((r) => ({
              utilityAccountId: r.accountId,
              buildingId,
              periodStart: r.periodStart,
              periodEnd: r.periodEnd,
              consumptionValue: String(r.consumptionValue),
              consumptionUnit: r.unit,
              costDollars: r.costUsd !== null && !isNaN(r.costUsd) ? String(r.costUsd) : null,
              source: "csv_upload" as const,
              confidence: "confirmed" as const,
            }))
          );
          rowsImported += batch.length;
        } catch (err) {
          // If batch fails, try individual inserts for this batch
          for (const r of batch) {
            try {
              await db.insert(utilityReadings).values({
                utilityAccountId: r.accountId,
                buildingId,
                periodStart: r.periodStart,
                periodEnd: r.periodEnd,
                consumptionValue: String(r.consumptionValue),
                consumptionUnit: r.unit,
                costDollars: r.costUsd !== null && !isNaN(r.costUsd) ? String(r.costUsd) : null,
                source: "csv_upload",
                confidence: "confirmed",
              });
              rowsImported++;
            } catch (innerErr) {
              const msg = innerErr instanceof Error ? innerErr.message : "Unknown error";
              errorLog.push({ row: r.rowNum, message: msg });
              rowsFailed++;
            }
          }
        }
      }

      await db.update(importJobs).set({
        status: rowsFailed === rows.length ? "failed" : "completed",
        rowsImported,
        rowsFailed,
        errorLog: errorLog.length > 0 ? errorLog : null,
        completedAt: new Date(),
      }).where(eq(importJobs.id, jobId));

      return { jobId, rowsImported, rowsFailed };
    } catch (err) {
      console.error('CSV import background job failed:', err);
      await db.update(importJobs).set({
        status: "failed",
        rowsImported,
        rowsFailed,
        errorLog: [...errorLog, { row: 0, message: err instanceof Error ? err.message : "Background job failed" }],
        completedAt: new Date(),
      }).where(eq(importJobs.id, jobId));
      throw err;
    }
  }
);
