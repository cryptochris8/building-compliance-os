import Link from "next/link";
import { Calculator, Check, FileBarChart, Gauge, ShieldCheck, Zap } from "lucide-react";

const features = [
  { icon: Calculator, title: "Emissions Calculator", description: "Accurate tCO2e calculations using official LL97 carbon coefficients for all fuel types." },
  { icon: Gauge, title: "Compliance Dashboard", description: "Real-time compliance status across your entire portfolio with penalty exposure tracking." },
  { icon: ShieldCheck, title: "Gap Detection", description: "Automatically detect missing utility data and get confidence scores for your calculations." },
  { icon: FileBarChart, title: "Report Generation", description: "Generate professional PDF compliance reports ready for submission to NYC DOB." },
];

const tiers = [
  { name: "Free", price: "$0", period: "", description: "Get started with one building",
    features: ["1 building", "Manual data entry", "Basic compliance status"], cta: "Start Free", highlighted: false },
  { name: "Pro", price: "$149", period: "/month", description: "For building owners and managers",
    features: ["Up to 10 buildings", "CSV upload", "Report generation", "Portfolio Manager sync", "Email support"],
    cta: "Start 14-Day Trial", highlighted: true },
  { name: "Portfolio", price: "$499", period: "/month", description: "For large portfolios",
    features: ["Up to 50 buildings", "Everything in Pro", "Bulk operations", "Priority support", "Custom reports"],
    cta: "Start 14-Day Trial", highlighted: false },
];

export default function MarketingPage() {
  return (
    <div>
      <section className="py-20 lg:py-32">
        <div className="container mx-auto px-4 text-center">
          <div className="inline-flex items-center rounded-full border px-3 py-1 text-sm text-muted-foreground mb-6">
            <Zap className="h-3.5 w-3.5 mr-1.5 text-primary" />
            NYC Local Law 97 Compliance
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight max-w-4xl mx-auto">
            Know Your Building&apos;s LL97 Compliance Status in{" "}
            <span className="text-primary">10 Minutes</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            Stop guessing about your building emissions. Calculate compliance,
            track deadlines, and generate reports &mdash; all in one platform.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup" className="inline-flex items-center justify-center rounded-md bg-primary px-8 py-3 text-base font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors">Start Free</Link>
            <Link href="/calculator" className="inline-flex items-center justify-center rounded-md border px-8 py-3 text-base font-medium hover:bg-muted transition-colors"><Calculator className="mr-2 h-4 w-4" /> Try Free Calculator</Link>
          </div>
        </div>
      </section>

      <section className="py-16 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">The LL97 Problem</h2>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">NYC buildings face steep penalties for exceeding carbon emissions limits.</p>
          </div>
          <div className="grid gap-8 md:grid-cols-3 max-w-4xl mx-auto">
            {[{ val: "$268", desc: "Per metric ton over the limit" }, { val: "50,000+", desc: "NYC buildings covered by LL97" }, { val: "2024", desc: "Enforcement already started" }].map((item) => (
              <div key={item.val} className="text-center p-6 rounded-lg bg-card border">
                <p className="text-4xl font-bold text-primary">{item.val}</p>
                <p className="text-sm text-muted-foreground mt-1">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">How It Works</h2>
            <p className="mt-3 text-muted-foreground">Three simple steps to compliance clarity.</p>
          </div>
          <div className="grid gap-8 md:grid-cols-3 max-w-4xl mx-auto">
            {[
              { step: "1", title: "Add Building", desc: "Enter your building details: address, square footage, and occupancy type." },
              { step: "2", title: "Enter Utility Data", desc: "Input your electricity, gas, and other utility consumption data." },
              { step: "3", title: "See Compliance", desc: "Get instant emissions calculations, compliance status, and penalty estimates." },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg">{item.step}</div>
                <h3 className="text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">Everything You Need</h2>
            <p className="mt-3 text-muted-foreground">Built specifically for NYC LL97 compliance.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 max-w-5xl mx-auto">
            {features.map((feature) => (
              <div key={feature.title} className="rounded-lg border bg-card p-6">
                <feature.icon className="h-8 w-8 text-primary mb-3" />
                <h3 className="font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">Simple, Transparent Pricing</h2>
            <p className="mt-3 text-muted-foreground">Start free. Upgrade when you need to.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
            {tiers.map((tier) => (
              <div key={tier.name} className={`rounded-lg border bg-card p-8 ${tier.highlighted ? "ring-2 ring-primary border-primary" : ""}`}>
                {tier.highlighted && (
                  <span className="inline-block rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground mb-3">Most Popular</span>
                )}
                <h3 className="text-xl font-bold">{tier.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{tier.description}</p>
                <div className="mt-4"><span className="text-4xl font-bold">{tier.price}</span><span className="text-muted-foreground">{tier.period}</span></div>
                <ul className="mt-6 space-y-2">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />{f}</li>
                  ))}
                </ul>
                <Link href="/signup" className={`mt-6 block text-center rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${tier.highlighted ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border hover:bg-muted"}`}>{tier.cta}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold">Calculate Your LL97 Penalty &mdash; Free</h2>
          <p className="mt-3 text-lg opacity-90 max-w-xl mx-auto">No signup required. Enter your building details and get an instant emissions estimate.</p>
          <Link href="/calculator" className="mt-6 inline-flex items-center justify-center rounded-md bg-white text-primary px-8 py-3 text-base font-medium shadow hover:bg-white/90 transition-colors">
            <Calculator className="mr-2 h-4 w-4" /> Open Free Calculator
          </Link>
        </div>
      </section>
    </div>
  );
}
