// ============================================================
// Data Validation Rules for Utility Readings
// ============================================================

import { getDefaultUnitForUtilityType } from '@/lib/utils/unit-conversion';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  field: string;
  message: string;
  severity: ValidationSeverity;
  code: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface ReadingInput {
  utilityAccountId: string;
  utilityType: string;
  periodStart: string;
  periodEnd: string;
  consumptionValue: number;
  consumptionUnit: string;
}

export interface ExistingReading {
  id: string;
  utilityAccountId: string;
  utilityType: string;
  periodStart: string;
  periodEnd: string;
  consumptionValue: number;
  consumptionUnit: string;
}

/**
 * Validate a reading against a set of rules including outlier detection,
 * duplicate detection, date validation, and unit consistency.
 */
export function validateReading(
  reading: ReadingInput,
  existingReadings: ExistingReading[]
): ValidationResult {
  const issues: ValidationIssue[] = [];

  // Rule 1: Negative value check
  if (reading.consumptionValue < 0) {
    issues.push({
      field: 'consumptionValue',
      message: 'Consumption value must be >= 0',
      severity: 'error',
      code: 'NEGATIVE_VALUE',
    });
  }

  // Rule 2: Date range validation - period_start must be before period_end
  const startDate = new Date(reading.periodStart);
  const endDate = new Date(reading.periodEnd);

  if (isNaN(startDate.getTime())) {
    issues.push({
      field: 'periodStart',
      message: 'Period start date is invalid',
      severity: 'error',
      code: 'INVALID_START_DATE',
    });
  }

  if (isNaN(endDate.getTime())) {
    issues.push({
      field: 'periodEnd',
      message: 'Period end date is invalid',
      severity: 'error',
      code: 'INVALID_END_DATE',
    });
  }

  if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
    if (startDate >= endDate) {
      issues.push({
        field: 'periodStart',
        message: 'Period start must be before period end',
        severity: 'error',
        code: 'INVALID_DATE_RANGE',
      });
    }

    // Rule 3: Period must not be in the future
    const now = new Date();
    if (endDate > now) {
      issues.push({
        field: 'periodEnd',
        message: 'Period end date cannot be in the future',
        severity: 'warning',
        code: 'FUTURE_DATE',
      });
    }
  }

  // Rule 4: Duplicate detection - same account + overlapping period
  const isDuplicate = existingReadings.some(
    (existing) =>
      existing.utilityAccountId === reading.utilityAccountId &&
      existing.periodStart === reading.periodStart &&
      existing.periodEnd === reading.periodEnd
  );

  if (isDuplicate) {
    issues.push({
      field: 'periodStart',
      message: 'A reading already exists for this account and period',
      severity: 'error',
      code: 'DUPLICATE_READING',
    });
  }

  // Rule 5: Outlier detection - flag if value > 3x average of existing readings for same utility type
  const sameTypeReadings = existingReadings.filter(
    (r) => r.utilityType === reading.utilityType
  );

  if (sameTypeReadings.length >= 3) {
    const average =
      sameTypeReadings.reduce((sum, r) => sum + r.consumptionValue, 0) /
      sameTypeReadings.length;

    if (reading.consumptionValue > average * 3) {
      issues.push({
        field: 'consumptionValue',
        message: `Value (${reading.consumptionValue}) is more than 3x the average (${Math.round(average)}) for ${reading.utilityType}. This may be an outlier.`,
        severity: 'warning',
        code: 'OUTLIER_DETECTED',
      });
    }
  }

  // Rule 6: Unit consistency - warn if unit doesn't match expected unit for utility type
  const expectedUnit = getDefaultUnitForUtilityType(reading.utilityType);
  if (
    reading.consumptionUnit.toLowerCase() !== expectedUnit.toLowerCase() &&
    reading.consumptionUnit.toLowerCase() !== 'kbtu'
  ) {
    issues.push({
      field: 'consumptionUnit',
      message: `Unit "${reading.consumptionUnit}" is unusual for ${reading.utilityType}. Expected "${expectedUnit}".`,
      severity: 'warning',
      code: 'UNIT_MISMATCH',
    });
  }

  const hasErrors = issues.some((i) => i.severity === 'error');

  return {
    valid: !hasErrors,
    issues,
  };
}
