import { monthlyPMSync } from '@/lib/portfolio-manager/scheduled-sync';
import { processCsvImport } from './process-csv-import';
import { generateReport } from './generate-report';
import { deadlineRemindersCron } from './deadline-reminders-cron';

export const functions = [
  monthlyPMSync,
  processCsvImport,
  generateReport,
  deadlineRemindersCron,
];
