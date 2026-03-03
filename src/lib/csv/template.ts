// ============================================================
// CSV Template Generator
// Generates CSV template content and sample data for utility imports
// ============================================================

export const CSV_HEADERS = [
  'utility_type',
  'account_number',
  'period_start',
  'period_end',
  'consumption_value',
  'consumption_unit',
  'cost_usd',
] as const;

export type CsvHeader = (typeof CSV_HEADERS)[number];

export interface CsvRow {
  utility_type: string;
  account_number: string;
  period_start: string;
  period_end: string;
  consumption_value: string;
  consumption_unit: string;
  cost_usd: string;
}

/**
 * Generate CSV template content with correct headers.
 */
export function generateCsvTemplate(): string {
  const headerLine = CSV_HEADERS.join(',');
  const sampleRows = generateSampleRows();
  const dataLines = sampleRows.map((row) =>
    CSV_HEADERS.map((h) => row[h]).join(',')
  );
  return [headerLine, ...dataLines].join('\n');
}

/**
 * Generate sample CSV rows for the template.
 */
export function generateSampleRows(): CsvRow[] {
  return [
    {
      utility_type: 'electricity',
      account_number: 'ELEC-001',
      period_start: '2024-01-01',
      period_end: '2024-01-31',
      consumption_value: '45000',
      consumption_unit: 'kwh',
      cost_usd: '6750.00',
    },
    {
      utility_type: 'natural_gas',
      account_number: 'GAS-001',
      period_start: '2024-01-01',
      period_end: '2024-01-31',
      consumption_value: '1200',
      consumption_unit: 'therms',
      cost_usd: '1440.00',
    },
    {
      utility_type: 'district_steam',
      account_number: 'STEAM-001',
      period_start: '2024-01-01',
      period_end: '2024-01-31',
      consumption_value: '85000',
      consumption_unit: 'kbtu',
      cost_usd: '4250.00',
    },
    {
      utility_type: 'fuel_oil_2',
      account_number: 'OIL-001',
      period_start: '2024-01-01',
      period_end: '2024-01-31',
      consumption_value: '500',
      consumption_unit: 'gallons',
      cost_usd: '2000.00',
    },
  ];
}

/**
 * Generate the template as a downloadable Blob URL (for client-side use).
 */
export function getCsvTemplateContent(): string {
  return generateCsvTemplate();
}
