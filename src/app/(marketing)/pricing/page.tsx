import Link from "next/link";
import { Check, X } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing | Building Compliance OS",
  description: "Simple, transparent pricing for LL97 compliance software. Start free and upgrade as your portfolio grows.",
};

const tiers = [
  { name: "Free", monthlyPrice: "$0", annualPrice: "$0", description: "Get started with one building", cta: "Start Free", highlighted: false },
  { name: "Pro", monthlyPrice: "$149", annualPrice: "$99", description: "For building owners and managers", cta: "Start 14-Day Trial", highlighted: true },
  { name: "Portfolio", monthlyPrice: "$499", annualPrice: "$399", description: "For large portfolios", cta: "Start 14-Day Trial", highlighted: false },
];

interface FeatureRow { feature: string; free: string | boolean; pro: string | boolean; portfolio: string | boolean; }

const comparisonFeatures: FeatureRow[] = [
  { feature: "Buildings", free: "1", pro: "10", portfolio: "50" },
  { feature: "Manual Data Entry", free: true, pro: true, portfolio: true },
  { feature: "CSV Upload", free: false, pro: true, portfolio: true },
  { feature: "Compliance Status", free: true, pro: true, portfolio: true },
  { feature: "Emissions Calculator", free: true, pro: true, portfolio: true },
  { feature: "Report Generation", free: false, pro: true, portfolio: true },
  { feature: "Portfolio Manager Sync", free: false, pro: true, portfolio: true },
  { feature: "Bulk Operations", free: false, pro: false, portfolio: true },
  { feature: "Priority Support", free: false, pro: false, portfolio: true },
  { feature: "Custom Reports", free: false, pro: false, portfolio: true },
];

function FeatureCell({ value }: { value: string | boolean }) {
  if (typeof value === "string") return <span className="font-medium">{value}</span>;
  return value ? <Check className="h-5 w-5 text-primary mx-auto" /> : <X className="h-5 w-5 text-muted-foreground/40 mx-auto" />;
}

export default function PricingPage() {
  return (
    <div className="py-16">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight">Simple, Transparent Pricing</h1>
          <p className="mt-3 text-lg text-muted-foreground max-w-xl mx-auto">Start free. Upgrade when you need to. All paid plans include a 14-day free trial.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto mb-16">
          {tiers.map((tier) => (
            <div key={tier.name} className={`rounded-lg border bg-card p-8 ${tier.highlighted ? "ring-2 ring-primary border-primary" : ""}`}>
              {tier.highlighted && (<span className="inline-block rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground mb-3">Most Popular</span>)}
              <h3 className="text-xl font-bold">{tier.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">{tier.description}</p>
              <div className="mt-4"><span className="text-4xl font-bold">{tier.monthlyPrice}</span><span className="text-muted-foreground">/month</span></div>
              {tier.annualPrice !== "$0" && (<p className="text-sm text-muted-foreground mt-1">or {tier.annualPrice}/mo billed annually</p>)}
              <Link href="/signup" className={`mt-6 block text-center rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${tier.highlighted ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border hover:bg-muted"}`}>{tier.cta}</Link>
            </div>
          ))}
        </div>
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">Feature Comparison</h2>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b bg-muted/50"><th className="text-left p-4 text-sm font-medium">Feature</th><th className="text-center p-4 text-sm font-medium">Free</th><th className="text-center p-4 text-sm font-medium">Pro</th><th className="text-center p-4 text-sm font-medium">Portfolio</th></tr></thead>
              <tbody>
                {comparisonFeatures.map((row) => (
                  <tr key={row.feature} className="border-b last:border-0">
                    <td className="p-4 text-sm">{row.feature}</td>
                    <td className="p-4 text-sm text-center"><FeatureCell value={row.free} /></td>
                    <td className="p-4 text-sm text-center"><FeatureCell value={row.pro} /></td>
                    <td className="p-4 text-sm text-center"><FeatureCell value={row.portfolio} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
