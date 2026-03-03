"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { readingFormSchema, type ReadingFormValues } from "@/app/actions/readings";

interface UtilityAccountOption {
  id: string;
  accountNumber: string | null;
  utilityType: string;
  providerName: string | null;
}

interface ReadingFormProps {
  buildingId: string;
  accounts: UtilityAccountOption[];
  defaultValues?: Partial<ReadingFormValues>;
  onSubmit: (values: ReadingFormValues) => Promise<void>;
  isSubmitting?: boolean;
  mode?: "create" | "edit";
}

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const CONSUMPTION_UNITS = [
  { value: "kwh", label: "kWh (kilowatt-hours)" },
  { value: "therms", label: "Therms" },
  { value: "kbtu", label: "kBtu" },
  { value: "gallons", label: "Gallons" },
];

const CONFIDENCE_LEVELS = [
  { value: "confirmed", label: "Confirmed" },
  { value: "estimated", label: "Estimated" },
  { value: "flagged", label: "Flagged" },
];

export function ReadingForm({
  buildingId,
  accounts,
  defaultValues,
  onSubmit,
  isSubmitting = false,
  mode = "create",
}: ReadingFormProps) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const form = useForm<ReadingFormValues>({
    resolver: zodResolver(readingFormSchema),
    defaultValues: {
      buildingId,
      utilityAccountId: "",
      periodMonth: currentMonth,
      periodYear: currentYear,
      consumptionValue: "",
      consumptionUnit: "kwh",
      costDollars: "",
      source: "manual",
      confidence: "confirmed",
      ...defaultValues,
    },
  });

  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              {mode === "create" ? "New Utility Reading" : "Edit Utility Reading"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <input type="hidden" {...form.register("buildingId")} />

            <FormField
              control={form.control}
              name="utilityAccountId"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Utility Account</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a utility account" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.utilityType.replace("_", " ")} - {account.accountNumber || "No account #"}
                          {account.providerName ? " (" + account.providerName + ")" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Select the utility account for this reading</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="periodMonth"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Month</FormLabel>
                  <Select
                    onValueChange={(val) => field.onChange(Number(val))}
                    defaultValue={String(field.value)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select month" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {MONTHS.map((month) => (
                        <SelectItem key={month.value} value={month.value}>
                          {month.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="periodYear"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Year</FormLabel>
                  <Select
                    onValueChange={(val) => field.onChange(Number(val))}
                    defaultValue={String(field.value)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select year" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {yearOptions.map((year) => (
                        <SelectItem key={year} value={String(year)}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="consumptionValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Consumption Value</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormDescription>Total consumption for the period</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="consumptionUnit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Consumption Unit</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CONSUMPTION_UNITS.map((unit) => (
                        <SelectItem key={unit.value} value={unit.value}>
                          {unit.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="costDollars"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cost (USD) - Optional</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormDescription>Total cost for the period in dollars</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confidence"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confidence Level</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select confidence" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CONFIDENCE_LEVELS.map((level) => (
                        <SelectItem key={level.value} value={level.value}>
                          {level.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>How confident are you in this data?</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => window.history.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? "Saving..."
              : mode === "create"
                ? "Add Reading"
                : "Update Reading"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
