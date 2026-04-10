import Link from "next/link";
import { Calculator, Check, FileBarChart, Gauge, ShieldCheck, Zap } from "lucide-react";

const features = [
  { icon: Calculator, title: "Emissions Calculator", description: "Accurate tCO2e calculations using official LL97 carbon coefficients for all fuel types." },
  { icon: Gauge, title: "Compliance Dashboard", description: "Real-time compliance status across your entire portfolio with penalty exposure tracking." },
  { icon: ShieldCheck, title: "Gap Detection", description: "Automatically detect missing utility data and get confidence scores for your calculations." },
  { icon: FileBarChart, title: "Report Generation", description: "Generate professional PDF compliance reports ready for submission to NYC DOB." },
];

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "",
    description: "Get started with one building",
    features: ["1 building", "Manual data entry", "Basic compliance status"],
    cta: "Start Free",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$149",
    period: "/month",
    description: "For building owners and managers",
    features: ["Up to 10 buildings", "CSV upload", "Report generation", "Portfolio Manager sync", "Email support"],
    cta: "Start 14-Day Trial",
    highlighted: true,
  },
  {
    name: "Portfolio",
    price: "$499",
    period: "/month",
    description: "For large portfolios",
    features: ["Up to 50 buildings", "Everything in Pro", "Bulk operations", "Priority support", "Custom reports"],
    cta: "Start 14-Day Trial",
    highlighted: false,
  },
];

const steps = [
  { step: "1", title: "Add Building", desc: "Enter your building details: address, square footage, and occupancy type." },
  { step: "2", title: "Enter Utility Data", desc: "Input your electricity, gas, and other utility consumption data." },
  { step: "3", title: "See Compliance", desc: "Get instant emissions calculations, compliance status, and penalty estimates." },
];

export default function MarketingPage() {
  return (
    <div className="scroll-smooth">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative py-24 lg:py-36 overflow-hidden">
        {/* Subtle radial gradient background */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10
            bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,hsl(var(--color-primary,220_60%_25%)/_0.08),transparent)]
            dark:bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,hsl(var(--color-primary,220_60%_25%)/_0.15),transparent)]"
        />
        {/* Soft grid texture */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.03] dark:opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(var(--color-foreground,#000) 1px,transparent 1px),linear-gradient(90deg,var(--color-foreground,#000) 1px,transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div className="container mx-auto px-4 text-center">
          <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-sm text-muted-foreground mb-8 shadow-sm">
            <Zap className="h-3.5 w-3.5 mr-1.5 text-primary" />
            NYC Local Law 97 Compliance
          </div>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight max-w-4xl mx-auto leading-[1.05]">
            Know Your Building&apos;s LL97 Compliance Status in{" "}
            <span className="relative inline-block bg-gradient-to-br from-primary via-primary to-primary/70 bg-clip-text text-transparent dark:from-primary dark:via-sky-400 dark:to-primary/80">
              10 Minutes
            </span>
          </h1>

          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Stop guessing about your building emissions. Calculate compliance,
            track deadlines, and generate reports &mdash; all in one platform.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-md bg-primary px-8 py-3 text-base font-semibold text-primary-foreground shadow-md hover:bg-primary/90 hover:shadow-lg transition-all duration-200"
            >
              Start Free
            </Link>
            <Link
              href="/calculator"
              className="inline-flex items-center justify-center rounded-md border border-border bg-card px-8 py-3 text-base font-medium hover:bg-muted hover:border-primary/30 transition-all duration-200"
            >
              <Calculator className="mr-2 h-4 w-4 text-primary" />
              Try Free Calculator
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      <section className="py-16 bg-muted/40">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight">The LL97 Problem</h2>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
              NYC buildings face steep penalties for exceeding carbon emissions limits.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3 max-w-4xl mx-auto">
            {[
              { val: "$268", desc: "Per metric ton over the limit" },
              { val: "50,000+", desc: "NYC buildings covered by LL97" },
              { val: "2024", desc: "Enforcement already started" },
            ].map((item) => (
              <div
                key={item.val}
                className="text-center p-8 rounded-xl bg-card border border-border/60 shadow-sm
                  hover:border-primary/25 hover:shadow-md transition-all duration-200"
              >
                <p className="text-5xl font-bold text-primary tabular-nums">{item.val}</p>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold tracking-tight">How It Works</h2>
            <p className="mt-3 text-muted-foreground">Three simple steps to compliance clarity.</p>
          </div>

          {/* Steps with connecting lines on desktop */}
          <div className="relative max-w-4xl mx-auto">
            {/* Connector line behind the step circles */}
            <div
              aria-hidden="true"
              className="hidden md:block absolute top-6 left-[calc(16.67%+1.5rem)] right-[calc(16.67%+1.5rem)] h-px bg-gradient-to-r from-border via-primary/30 to-border"
            />
            <div className="grid gap-10 md:grid-cols-3 relative">
              {steps.map((item) => (
                <div key={item.step} className="text-center flex flex-col items-center">
                  <div className="relative mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg shadow-md ring-4 ring-background z-10">
                    {item.step}
                  </div>
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-[200px]">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section className="py-20 bg-muted/40">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight">Everything You Need</h2>
            <p className="mt-3 text-muted-foreground">Built specifically for NYC LL97 compliance.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4 max-w-5xl mx-auto">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-xl border border-border/60 bg-card p-6 shadow-sm
                  hover:border-primary/30 hover:shadow-md hover:-translate-y-0.5
                  transition-all duration-200"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 group-hover:bg-primary/15 transition-colors">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight">Simple, Transparent Pricing</h2>
            <p className="mt-3 text-muted-foreground">Start free. Upgrade when you need to.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto items-start">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={[
                  "relative rounded-xl border bg-card p-8 transition-all duration-200",
                  tier.highlighted
                    ? "border-primary shadow-[0_0_0_1px_var(--color-primary),0_8px_32px_-4px_oklch(0.31_0.09_255_/_0.25)] dark:shadow-[0_0_0_1px_var(--color-primary),0_8px_40px_-4px_oklch(0.68_0.16_245_/_0.35)] scale-[1.02] z-10"
                    : "border-border/60 shadow-sm hover:border-primary/20 hover:shadow-md",
                ].join(" ")}
              >
                {tier.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-block rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground shadow-sm tracking-wide uppercase">
                      Most Popular
                    </span>
                  </div>
                )}
                <h3 className="text-xl font-bold">{tier.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{tier.description}</p>
                <div className="mt-5 flex items-end gap-0.5">
                  <span className="text-4xl font-bold tabular-nums">{tier.price}</span>
                  <span className="text-muted-foreground pb-1">{tier.period}</span>
                </div>
                <ul className="mt-6 space-y-2.5">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={[
                    "mt-7 block text-center rounded-md px-4 py-2.5 text-sm font-semibold transition-all duration-200",
                    tier.highlighted
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm hover:shadow-md"
                      : "border border-border hover:bg-muted hover:border-primary/30",
                  ].join(" ")}
                >
                  {tier.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ───────────────────────────────────────────────────── */}
      <section className="relative py-20 overflow-hidden">
        {/* Gradient background */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-br from-primary via-primary to-primary/80 dark:from-primary/90 dark:via-primary dark:to-sky-800"
        />
        {/* Subtle noise/texture overlay */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 80%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        <div className="container mx-auto px-4 text-center text-primary-foreground">
          <h2 className="text-3xl font-bold">Calculate Your LL97 Penalty &mdash; Free</h2>
          <p className="mt-4 text-lg opacity-90 max-w-xl mx-auto leading-relaxed">
            No signup required. Enter your building details and get an instant emissions estimate.
          </p>
          <Link
            href="/calculator"
            className="mt-8 inline-flex items-center justify-center rounded-md bg-white text-primary px-8 py-3 text-base font-semibold shadow-lg hover:bg-white/95 hover:shadow-xl transition-all duration-200"
          >
            <Calculator className="mr-2 h-4 w-4" />
            Open Free Calculator
          </Link>
        </div>
      </section>
    </div>
  );
}
