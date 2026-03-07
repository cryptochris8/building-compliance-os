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
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        try {
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
          let accountId: string;

          const existingAccounts = await db
            .select()
            .from(utilityAccounts)
            .where(
              and(
                eq(utilityAccounts.buildingId, buildingId),
                eq(utilityAccounts.utilityType, utilityType as "electricity" | "natural_gas" | "district_steam" | "fuel_oil_2" | "fuel_oil_4")
              )
            );

          const matchingAccount = accountNumber
            ? existingAccounts.find((a) => a.accountNumber === accountNumber)
            : existingAccounts[0];

          if (matchingAccount) {
            accountId = matchingAccount.id;
          } else {
            const [newAccount] = await db.insert(utilityAccounts).values({
              buildingId,
              utilityType: utilityType as "electricity" | "natural_gas" | "district_steam" | "fuel_oil_2" | "fuel_oil_4",
              accountNumber,
            }).returning();
            accountId = newAccount.id;
          }

          const costUsd = row.cost_usd ? parseFloat(row.cost_usd) : null;

          await db.insert(utilityReadings).values({
            utilityAccountId: accountId,
            buildingId,
            periodStart: row.period_start,
            periodEnd: row.period_end,
            consumptionValue: String(consumptionValue),
            consumptionUnit: unit,
            costDollars: costUsd !== null && !isNaN(costUsd) ? String(costUsd) : null,
            source: "csv_upload",
            confidence: "confirmed",
          });

          rowsImported++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          errorLog.push({ row: rowNum, message: msg });
          rowsFailed++;
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
