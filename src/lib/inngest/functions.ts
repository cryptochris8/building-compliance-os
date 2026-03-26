import { monthlyPMSync } from '@/lib/portfolio-manager/scheduled-sync';
import { processCsvImport } from './process-csv-import';
import { generateReport } from './generate-report';

export const functions = [
  monthlyPMSync,
  processCsvImport,
  generateReport,
];
