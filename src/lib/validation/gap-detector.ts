// ============================================================
// Data Gap Detection Engine
// Detects missing monthly utility data for compliance reporting
// ============================================================

export interface AccountGap {
  accountId: string;
  utilityType: string;
  missingMonths: number[];
  completeness: number;
}

export interface GapReport {
  buildingId: string;
  year: number;
  accounts: AccountGap[];
  overallCompleteness: number;
}

export interface GapReadingInput {
  utilityAccountId: string;
  periodStart: string;
  periodEnd: string;
}

export interface GapAccountInput {
  id: string;
  utilityType: string;
}

/**
 * Get the set of months (1-12) covered by a reading's period.
 */
function getMonthsCovered(
  periodStart: string,
  periodEnd: string,
  year: number
): Set<number> {
  const months = new Set<number>();
  const start = new Date(periodStart);
  const end = new Date(periodEnd);

  // Iterate month by month
  const current = new Date(start.getFullYear(), start.getMonth(), 1);
  while (current <= end) {
    if (current.getFullYear() === year) {
      months.add(current.getMonth() + 1); // 1-indexed months
    }
    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

/**
 * Detect data gaps for a building's utility accounts in a given year.
 *
 * For each utility account, checks which months (1-12) have readings
 * and returns a report with missing months and completeness percentages.
 */
export function detectGaps(
  buildingId: string,
  year: number,
  utilityAccounts: GapAccountInput[],
  readings: GapReadingInput[]
): GapReport {
  if (utilityAccounts.length === 0) {
    return {
      buildingId,
      year,
      accounts: [],
      overallCompleteness: 0,
    };
  }

  const accounts: AccountGap[] = utilityAccounts.map((account) => {
    const accountReadings = readings.filter(
      (r) => r.utilityAccountId === account.id
    );

    const coveredMonths = new Set<number>();
    for (const reading of accountReadings) {
      const months = getMonthsCovered(reading.periodStart, reading.periodEnd, year);
      months.forEach((m) => coveredMonths.add(m));
    }

    const missingMonths: number[] = [];
    for (let month = 1; month <= 12; month++) {
      if (!coveredMonths.has(month)) {
        missingMonths.push(month);
      }
    }

    const completeness = Math.round(((12 - missingMonths.length) / 12) * 100);

    return {
      accountId: account.id,
      utilityType: account.utilityType,
      missingMonths,
      completeness,
    };
  });

  const overallCompleteness =
    accounts.length > 0
      ? Math.round(
          accounts.reduce((sum, a) => sum + a.completeness, 0) /
            accounts.length
        )
      : 0;

  return {
    buildingId,
    year,
    accounts,
    overallCompleteness,
  };
}

/**
 * Get a human-readable month name from a month number (1-12).
 */
export function getMonthName(month: number): string {
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return names[month - 1] ?? `Month ${month}`;
}
