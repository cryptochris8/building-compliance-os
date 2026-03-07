import { monthlyPMSync } from '@/lib/portfolio-manager/scheduled-sync';
import { processCsvImport } from './process-csv-import';

export const functions = [
  monthlyPMSync,
  processCsvImport,
];
