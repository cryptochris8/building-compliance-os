import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { importJobs, utilityAccounts, utilityReadings, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { parseCsv, validateCsvHeaders } from "@/lib/csv/parser";

const VALID_UTILITY_TYPES = ["electricity", "natural_gas", "district_steam", "fuel_oil_2", "fuel_oil_4"];
const VALID_UNITS = ["kwh", "therms", "kbtu", "gallons"];

function isValidDate(dateStr: string): boolean {
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: buildingId } = await params;

    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.name.endsWith(".csv")) {
      return NextResponse.json({ error: "Only CSV files are accepted" }, { status: 400 });
    }

    const csvText = await file.text();
    const parsed = parseCsv(csvText);

    // Validate headers
    const missingHeaders = validateCsvHeaders(parsed.headers);
    if (missingHeaders.length > 0) {
      return NextResponse.json(
        { error: "Missing required headers: " + missingHeaders.join(", ") },
        { status: 400 }
      );
    }

    const [dbUser] = await db.select({ organizationId: users.organizationId })
      .from(users).where(eq(users.id, user.id)).limit(1);
    if (!dbUser?.organizationId) {
      return NextResponse.json({ error: "User has no organization" }, { status: 400 });
    }

    const [job] = await db.insert(importJobs).values({
      organizationId: dbUser.organizationId,
      buildingId,
      fileName: file.name,
      filePath: "imports/" + buildingId + "/" + Date.now() + "-" + file.name,
      status: "processing",
      rowsTotal: parsed.rows.length,
    }).returning();

    // Process rows
    let rowsImported = 0;
    let rowsFailed = 0;
    const errorLog: { row: number; message: string }[] = [...parsed.errors];

    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i];
      const rowNum = i + 2; // +2 for header row and 0-indexing

      try {
        // Validate utility_type
        const utilityType = row.utility_type?.toLowerCase().trim();
        if (!VALID_UTILITY_TYPES.includes(utilityType)) {
          errorLog.push({ row: rowNum, message: "Invalid utility_type: " + row.utility_type });
          rowsFailed++;
          continue;
        }

        // Validate dates
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

        // Validate consumption
        const consumptionValue = parseFloat(row.consumption_value);
        if (isNaN(consumptionValue) || consumptionValue < 0) {
          errorLog.push({ row: rowNum, message: "Invalid consumption_value: " + row.consumption_value });
          rowsFailed++;
          continue;
        }

        // Validate unit
        const unit = row.consumption_unit?.toLowerCase().trim();
        if (!VALID_UNITS.includes(unit)) {
          errorLog.push({ row: rowNum, message: "Invalid consumption_unit: " + row.consumption_unit });
          rowsFailed++;
          continue;
        }

        // Find or create utility account
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

        // Create reading
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

    // Update job with results
    await db.update(importJobs).set({
      status: rowsFailed === parsed.rows.length ? "failed" : "completed",
      rowsImported,
      rowsFailed,
      errorLog: errorLog.length > 0 ? errorLog : null,
      completedAt: new Date(),
    }).where(eq(importJobs.id, job.id));

    return NextResponse.json({
      id: job.id,
      status: rowsFailed === parsed.rows.length ? "failed" : "completed",
      rowsTotal: parsed.rows.length,
      rowsImported,
      rowsFailed,
      fileName: file.name,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
