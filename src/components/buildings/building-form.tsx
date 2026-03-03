'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NYC_OCCUPANCY_TYPES, NYC_BOROUGHS } from '@/types';

// ============================================================
// Zod Schema for Building Form Validation
// ============================================================

export const buildingFormSchema = z.object({
  name: z.string().min(1, 'Building name is required'),
  addressLine1: z.string().min(1, 'Address is required'),
  addressLine2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(2, 'State is required').max(2, 'Use 2-letter state code'),
  zip: z.string().min(5, 'ZIP code is required'),
  borough: z.string().optional(),
  bbl: z.string().optional(),
  bin: z.string().optional(),
  grossSqft: z
    .string()
    .min(1, 'Gross square footage is required')
    .refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
      message: 'Must be a positive number',
    }),
  yearBuilt: z
    .string()
    .optional()
    .refine((val) => !val || (!isNaN(Number(val)) && Number(val) >= 1800 && Number(val) <= new Date().getFullYear()), {
      message: 'Enter a valid year',
    }),
  occupancyType: z.string().min(1, 'Occupancy type is required'),
  jurisdictionId: z.string().min(1, 'Jurisdiction is required'),
  notes: z.string().optional(),
});

export type BuildingFormValues = z.infer<typeof buildingFormSchema>;
// ============================================================
// Building Form Component
// ============================================================

interface BuildingFormProps {
  defaultValues?: Partial<BuildingFormValues>;
  onSubmit: (values: BuildingFormValues) => void;
  isSubmitting?: boolean;
}

export function BuildingForm({
  defaultValues,
  onSubmit,
  isSubmitting = false,
}: BuildingFormProps) {
  const form = useForm<BuildingFormValues>({
    resolver: zodResolver(buildingFormSchema),
    defaultValues: {
      name: '',
      addressLine1: '',
      addressLine2: '',
      city: 'New York',
      state: 'NY',
      zip: '',
      borough: '',
      bbl: '',
      bin: '',
      grossSqft: '',
      yearBuilt: '',
      occupancyType: '',
      jurisdictionId: 'nyc-ll97',
      notes: '',
      ...defaultValues,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Building Information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Building Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Empire State Building" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="addressLine1"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Address Line 1</FormLabel>
                  <FormControl>
                    <Input placeholder="Street address" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="addressLine2"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Address Line 2</FormLabel>
                  <FormControl>
                    <Input placeholder="Suite, floor, etc. (optional)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>City</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="state"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>State</FormLabel>
                  <FormControl>
                    <Input placeholder="NY" maxLength={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="zip"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ZIP Code</FormLabel>
                  <FormControl>
                    <Input placeholder="10001" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="borough"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Borough (NYC only)</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select borough" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {NYC_BOROUGHS.map((borough) => (
                        <SelectItem key={borough} value={borough}>
                          {borough}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Building Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="bbl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>BBL</FormLabel>
                  <FormControl>
                    <Input placeholder="Borough-Block-Lot (optional)" {...field} />
                  </FormControl>
                  <FormDescription>NYC Borough-Block-Lot identifier</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="bin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>BIN</FormLabel>
                  <FormControl>
                    <Input placeholder="Building Identification Number (optional)" {...field} />
                  </FormControl>
                  <FormDescription>NYC Building Identification Number</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="grossSqft"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gross Square Footage</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="25000" {...field} />
                  </FormControl>
                  <FormDescription>Total gross floor area in sq ft</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="yearBuilt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Year Built</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="1950" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="occupancyType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Occupancy Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select occupancy type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {NYC_OCCUPANCY_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Building use classification</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="jurisdictionId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Jurisdiction</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select jurisdiction" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="nyc-ll97">NYC Local Law 97</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>Applicable building performance standard</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Input placeholder="Additional notes (optional)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline">
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Building'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
