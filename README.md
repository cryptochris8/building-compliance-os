# Building Compliance OS

**TurboTax for Building Emissions** — the affordable compliance platform for building owners navigating carbon emission penalties.

Cities across America are fining building owners for producing too much carbon. New York City alone has 50,000+ buildings that must file annual emissions reports or face penalties of $268/ton over the limit. Building Compliance OS takes utility data (manual entry, CSV import, or EPA Portfolio Manager sync), calculates emissions automatically, flags compliance gaps, estimates penalty exposure, and generates filing-ready reports. Ten minutes per building instead of ten hours.

---

## Key Features

- **Emissions Calculation Engine** — NYC Local Law 97 coefficients built in. Jurisdiction-as-config architecture means adding Boston, DC, or Denver is a config file, not a rewrite.
- **Portfolio Dashboard** — Compliance status across all buildings at a glance with confidence flags based on data completeness.
- **What-If Scenarios** — "If I reduce electricity usage by 15%, my penalty drops by $42,000."
- **Data Gap Detection** — "You're missing March and April gas readings for 123 Main St."
- **CSV Bulk Import** — Upload utility data with validation and error reporting.
- **Compliance Workflow** — Calendar, checklists, year lock, evidence vault, deadline tracking.
- **Mixed-Use Support** — Ground floor retail + upper floors residential = weighted emissions limit.
- **LL97 Deductions** — Track renewable energy credits, on-site solar, and purchased offsets.
- **Report Generation** — PDF compliance reports ready for city filing.
- **EPA Portfolio Manager Sync** — Pull property data and energy readings from ENERGY STAR.
- **Stripe Billing** — Free (1 building), Pro $149/mo (10 buildings), Portfolio $499/mo (50 buildings).

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js (React 19, App Router) |
| Language | TypeScript |
| Database | Supabase Postgres |
| ORM | Drizzle ORM |
| Auth | Supabase Auth |
| UI | shadcn/ui + Tailwind CSS + Radix UI |
| Background Jobs | Inngest |
| Email | Resend |
| Billing | Stripe (subscriptions + webhooks) |
| Charts | Recharts |
| PDF Generation | @react-pdf/renderer |
| Error Monitoring | Sentry |

## Project Structure

```
src/
├── app/
│   ├── (auth)/           # Login, signup
│   ├── (dashboard)/      # Main app
│   │   ├── buildings/    # Building management, readings, reports, documents
│   │   ├── compliance/   # Portfolio-wide compliance overview
│   │   ├── dashboard/    # Home dashboard
│   │   ├── onboarding/   # First-time setup wizard
│   │   ├── portfolio/    # Portfolio analytics
│   │   └── settings/     # Account and billing settings
│   ├── (marketing)/      # Landing page, pricing
│   ├── actions/          # Server actions
│   └── api/              # API routes (billing, compliance, imports, reports, webhooks)
├── components/           # UI components
├── lib/                  # Core libraries (emissions engine, DB, auth helpers)
└── types/                # TypeScript type definitions
```

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project (auth + database + storage)
- Stripe account (billing)
- Resend account (email)
- Inngest account (background jobs)

### Local Development

1. **Clone and install dependencies:**
   ```bash
   git clone <your-repo-url>
   cd building-compliance-os
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env.local
   ```
   Fill in all values in `.env.local`. Each variable is documented in `.env.example` with instructions on where to find it.

3. **Push the database schema:**
   ```bash
   npx drizzle-kit push
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

5. **Open the app:**
   Visit [http://localhost:3000](http://localhost:3000).

### Production Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for a complete step-by-step guide to deploying on Vercel with all service dependencies.

## Environment Variables

All required environment variables are documented in [`.env.example`](.env.example) with descriptions, where to find each value, and which are safe to expose client-side vs. server-only secrets.

## License

Proprietary. All rights reserved.
