import { z } from 'zod';

// Reading form schema. Kept in a plain (non-"use server") module so it can be
// imported by client components for react-hook-form validation — a "use server"
// file may only export async functions.
export const readingFormSchema = z.object({
  utilityAccountId: z.string().min(1, 'Utility account is required'),
  buildingId: z.string().min(1, 'Building ID is required'),
  periodMonth: z.number().min(1).max(12, 'Month must be 1-12'),
  periodYear: z.number().min(2000).max(2100, 'Enter a valid year'),
  consumptionValue: z
    .string()
    .min(1, 'Consumption value is required')
    .refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
      message: 'Must be a non-negative number',
    }),
  consumptionUnit: z.enum(['kwh', 'therms', 'kbtu', 'gallons'], {
    error: 'Unit is required',
  }),
  costDollars: z
    .string()
    .optional()
    .refine((val) => !val || (!isNaN(Number(val)) && Number(val) >= 0), {
      message: 'Must be a non-negative number',
    }),
  source: z.enum(['manual', 'csv_upload', 'portfolio_manager', 'green_button']),
  confidence: z.enum(['confirmed', 'estimated', 'flagged']),
});

export type ReadingFormValues = z.infer<typeof readingFormSchema>;
