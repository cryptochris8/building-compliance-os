// ============================================================
// CSV Parser
// Simple CSV parser that handles quoted fields
// ============================================================

export interface ParsedCsvResult {
  headers: string[];
  rows: Record<string, string>[];
  errors: { row: number; message: string }[];
}

/**
 * Parse a single CSV line, handling quoted fields with commas inside.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote (double quote)
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }

  // Push the last field
  fields.push(current.trim());

  return fields;
}

/**
 * Parse raw CSV text into structured data.
 */
export function parseCsv(csvText: string): ParsedCsvResult {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [], errors: [{ row: 0, message: 'CSV file is empty' }] };
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
  const rows: Record<string, string>[] = [];
  const errors: { row: number; message: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);

    if (fields.length !== headers.length) {
      errors.push({
        row: i + 1,
        message: `Expected ${headers.length} fields but found ${fields.length}`,
      });
      continue;
    }

    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = fields[j];
    }
    rows.push(row);
  }

  return { headers, rows, errors };
}

/**
 * Validate the required CSV headers are present.
 */
export function validateCsvHeaders(headers: string[]): string[] {
  const required = [
    'utility_type',
    'account_number',
    'period_start',
    'period_end',
    'consumption_value',
    'consumption_unit',
  ];

  const missing = required.filter(
    (h) => !headers.includes(h.toLowerCase())
  );

  return missing;
}
