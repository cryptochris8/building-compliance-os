# Building Compliance OS - Deployment Guide

This guide walks through deploying Building Compliance OS from scratch, covering every service dependency and configuration step.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Supabase Setup](#2-supabase-setup)
3. [Stripe Setup](#3-stripe-setup)
4. [Resend Setup](#4-resend-setup)
5. [Inngest Setup](#5-inngest-setup)
6. [Sentry Setup](#6-sentry-setup)
7. [Vercel Deployment](#7-vercel-deployment)
8. [Environment Variables Configuration](#8-environment-variables-configuration)
9. [Post-Deployment Verification](#9-post-deployment-verification)
10. [Custom Domain Setup](#10-custom-domain-setup)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Prerequisites

You will need accounts on the following services. All offer free tiers sufficient for initial setup.

| Service | Purpose | Sign Up |
|---------|---------|---------|
| **Vercel** | Hosting and deployment | https://vercel.com/signup |
| **Supabase** | Auth, Postgres database, file storage | https://supabase.com/dashboard |
| **Stripe** | Billing and subscriptions | https://dashboard.stripe.com/register |
| **Resend** | Transactional email delivery | https://resend.com/signup |
| **Inngest** | Background jobs and scheduled tasks | https://app.inngest.com/sign-up |
| **Sentry** | Error monitoring and performance | https://sentry.io/signup/ |

You will also need:

- **Node.js 18.18+** installed locally (for running migrations)
- **Git** for version control
- **Stripe CLI** (optional, for local webhook testing) - https://stripe.com/docs/stripe-cli

---

## 2. Supabase Setup

### 2.1 Create a Supabase Project

1. Go to https://supabase.com/dashboard and click **New Project**.
2. Choose an organization (or create one).
3. Enter a project name (e.g., `building-compliance-os`).
4. Set a strong **database password** - save this, you will need it for `DATABASE_URL`.
5. Choose a **region** close to your users (e.g., `us-east-1` for US-based users).
6. Click **Create new project** and wait for provisioning to complete.

### 2.2 Collect API Credentials

Navigate to **Project Settings > API** and note:

- **Project URL** --> `NEXT_PUBLIC_SUPABASE_URL`
- **anon / public key** --> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role key** --> `SUPABASE_SERVICE_ROLE_KEY`

Navigate to **Project Settings > Database** and note:

- **Connection string (URI)** --> `DATABASE_URL`
  - Select **Transaction** mode (port 6543) for the app runtime connection string
  - Select **Session** mode (port 5432) for running Drizzle migrations locally

### 2.3 Run Database Migrations with Drizzle

The schema is defined in `src/lib/db/schema/index.ts` and Drizzle config is at `drizzle.config.ts`. Migrations output to `src/lib/db/migrations/`.

```bash
# Install dependencies if not already done
npm install

# Set DATABASE_URL to the Session-mode connection string (port 5432)
# for migration commands:
export DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"

# Generate migration files from the schema
npx drizzle-kit generate

# Push the schema directly to the database (recommended for initial setup)
npx drizzle-kit push

# Alternatively, run generated migrations
npx drizzle-kit migrate
```

### 2.4 Enable Row Level Security (RLS)

RLS must be enabled on all tables to ensure users can only access their own organization's data. In the Supabase SQL Editor, run:

```sql
-- Enable RLS on all application tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE utility_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE utility_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_property_mappings ENABLE ROW LEVEL SECURITY;

-- Example RLS policy: users can only read their own organization's buildings
CREATE POLICY "Users can view own org buildings"
  ON buildings FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Create similar policies for INSERT, UPDATE, DELETE on each table.
-- Adapt the policy logic to your authorization requirements.
```

> **Note:** The application primarily uses server-side Drizzle queries with the service role key for mutations. RLS policies protect against direct Supabase client access and serve as a defense-in-depth layer.

### 2.5 Configure Supabase Auth

1. In **Authentication > Providers**, ensure **Email** is enabled.
2. Under **Authentication > URL Configuration**:
   - Set **Site URL** to your production URL (e.g., `https://your-domain.com`).
   - Add `http://localhost:3000` to **Redirect URLs** for local development.
3. (Optional) Configure additional OAuth providers (Google, GitHub, etc.) as needed.

### 2.6 Set Up Storage Buckets

If using Supabase Storage for document uploads (Evidence Vault):

1. Go to **Storage** in the Supabase Dashboard.
2. Create a bucket named `documents` (or match the bucket name used in your upload code).
3. Set the bucket to **private** (access controlled via signed URLs).
4. Configure a storage policy allowing authenticated users to upload to their org's folder.

---

## 3. Stripe Setup

### 3.1 Create Products and Prices

In the Stripe Dashboard (https://dashboard.stripe.com/products), create the following products:

#### Product 1: Pro Plan

- **Name:** Pro
- **Description:** Up to 10 buildings, CSV upload, report generation, Portfolio Manager sync
- Create two **Prices**:
  - **Monthly:** $149.00 / month, recurring --> note the Price ID for `STRIPE_PRO_MONTHLY_PRICE_ID`
  - **Annual:** $99.00 / month billed yearly ($1,188/year), recurring --> note the Price ID for `STRIPE_PRO_ANNUAL_PRICE_ID`

#### Product 2: Portfolio Plan

- **Name:** Portfolio
- **Description:** Up to 50 buildings, bulk operations, priority support, custom reports
- Create two **Prices**:
  - **Monthly:** $499.00 / month, recurring --> note the Price ID for `STRIPE_PORTFOLIO_MONTHLY_PRICE_ID`
  - **Annual:** $399.00 / month billed yearly ($4,788/year), recurring --> note the Price ID for `STRIPE_PORTFOLIO_ANNUAL_PRICE_ID`

The **Free** tier (1 building, basic compliance) requires no Stripe product. It is the default for all new organizations.

### 3.2 Configure the Stripe Webhook

1. Go to **Developers > Webhooks** in the Stripe Dashboard.
2. Click **Add endpoint**.
3. Set the **Endpoint URL** to: `https://your-domain.com/api/webhooks/stripe`
4. Select the following events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. Click **Add endpoint**.
6. Copy the **Signing secret** (starts with `whsec_`) --> `STRIPE_WEBHOOK_SECRET`

### 3.3 Collect API Keys

Navigate to **Developers > API keys**:

- **Publishable key** (starts with `pk_test_` or `pk_live_`) --> `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- **Secret key** (starts with `sk_test_` or `sk_live_`) --> `STRIPE_SECRET_KEY`

### 3.4 Configure the Customer Portal

1. Go to **Settings > Billing > Customer portal**.
2. Enable the portal and configure:
   - Allow customers to switch plans (between Pro and Portfolio)
   - Allow customers to cancel subscriptions
   - Allow customers to update payment methods
3. Save changes.

### 3.5 Local Webhook Testing (Optional)

For local development, use the Stripe CLI to forward webhook events:

```bash
# Install Stripe CLI, then log in
stripe login

# Forward events to your local server
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# The CLI will output a webhook signing secret (whsec_...) for local use
# Set this as STRIPE_WEBHOOK_SECRET in your .env.local
```

---

## 4. Resend Setup

### 4.1 Verify Your Domain

1. Sign in at https://resend.com/domains.
2. Click **Add Domain** and enter your production domain (e.g., `yourdomain.com`).
3. Add the DNS records (MX, SPF, DKIM) that Resend provides to your domain registrar.
4. Wait for verification to complete (usually a few minutes, can take up to 48 hours).

### 4.2 Create an API Key

1. Go to https://resend.com/api-keys.
2. Click **Create API Key**.
3. Name it (e.g., `building-compliance-os-production`).
4. Set permission to **Sending access** and restrict to your verified domain.
5. Copy the API key (starts with `re_`) --> `RESEND_API_KEY`

### 4.3 Set the From Address

Choose a from address on your verified domain:

- `EMAIL_FROM=notifications@yourdomain.com` (or `compliance@yourdomain.com`, etc.)
- For development without a verified domain, use `onboarding@resend.dev` (sends only to your own email).

---

## 5. Inngest Setup

Inngest handles background jobs such as the monthly Portfolio Manager sync and other scheduled tasks.

### 5.1 Create an Inngest Account

1. Sign up at https://app.inngest.com/sign-up.
2. Create a new app or use the default one.

### 5.2 Connect to Vercel (Recommended)

1. In the Inngest Dashboard, go to **Integrations > Vercel**.
2. Click **Connect to Vercel** and authorize access.
3. Select your Vercel project. Inngest will automatically inject `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` into your Vercel environment.

### 5.3 Manual Key Configuration

If not using the Vercel integration:

1. Go to **Manage > Keys** in your Inngest environment.
2. Copy the **Event Key** --> `INNGEST_EVENT_KEY`
3. Copy the **Signing Key** (starts with `signkey-`) --> `INNGEST_SIGNING_KEY`
4. Manually add both to your Vercel environment variables.

### 5.4 Create the Inngest Serve Endpoint

Ensure your app has an API route that serves Inngest functions. Create a file at `src/app/api/inngest/route.ts`:

```typescript
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
```

### 5.5 Register Functions

After deployment, Inngest automatically discovers your functions by calling the serve endpoint. You can verify registration in the Inngest Dashboard under **Functions**.

Key functions to verify:

- **Monthly PM Sync** - `schedule.monthly` cron for Portfolio Manager data synchronization
- Any other background job functions defined in your Inngest functions directory

---

## 6. Sentry Setup

### 6.1 Create a Sentry Project

1. Sign in at https://sentry.io and create a new project.
2. Select **Next.js** as the platform.
3. Name the project (e.g., `building-compliance-os`).
4. Note the **DSN** from the project setup page --> `SENTRY_DSN`

### 6.2 Install and Configure the Sentry SDK

If not already installed:

```bash
npx @sentry/wizard@latest -i nextjs
```

This will:
- Install `@sentry/nextjs`
- Create `sentry.client.config.ts`, `sentry.server.config.ts`, and `sentry.edge.config.ts`
- Update `next.config.ts` to wrap with `withSentryConfig`
- Create `.sentryclirc` (add this to `.gitignore`)

### 6.3 Generate an Auth Token

1. Go to https://sentry.io/settings/auth-tokens/.
2. Create a new token with **project:releases** and **org:read** scopes.
3. Copy the token (starts with `sntrys_`) --> `SENTRY_AUTH_TOKEN`

This token is used during the build step to upload source maps so that error stack traces are readable.

---

## 7. Vercel Deployment

### 7.1 Import the Project

1. Go to https://vercel.com/new.
2. Click **Import Git Repository** and select your repository.
3. Vercel auto-detects the Next.js framework. Confirm the settings:
   - **Framework Preset:** Next.js
   - **Root Directory:** `./` (default)
   - **Build Command:** `next build` (default)
   - **Output Directory:** `.next` (default)
4. **Do not deploy yet** - first configure environment variables (Step 8).

### 7.2 Configure Build Settings

Under **Settings > General**:

- **Node.js Version:** 18.x or 20.x
- **Install Command:** `npm install` (default)

### 7.3 Set Environment Variables

See [Section 8](#8-environment-variables-configuration) for the full list. Add all variables before triggering the first build.

### 7.4 Deploy

1. After setting all environment variables, click **Deploy** (or push to your main branch to trigger automatic deployment).
2. Monitor the build logs in Vercel for any errors.
3. The first build will take longer due to dependency installation.

### 7.5 Configure Vercel Project Settings

After the initial deployment:

- **Settings > Functions > Function Region:** Choose a region close to your Supabase project (e.g., `iad1` for US East).
- **Settings > Functions > Function Max Duration:** Set to 60s (or higher on Pro plan) for PDF generation and data import operations.

---

## 8. Environment Variables Configuration

Add the following environment variables in **Vercel Dashboard > Your Project > Settings > Environment Variables**.

For each variable, select the appropriate environments (Production, Preview, Development).

### Required Variables

| Variable | Environments | Secret? | Source |
|----------|-------------|---------|--------|
| `NEXT_PUBLIC_APP_URL` | Production, Preview | No | Your production URL (e.g., `https://your-domain.com`) |
| `NEXT_PUBLIC_SUPABASE_URL` | All | No | Supabase Dashboard > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All | No | Supabase Dashboard > API |
| `SUPABASE_SERVICE_ROLE_KEY` | All | Yes | Supabase Dashboard > API |
| `DATABASE_URL` | All | Yes | Supabase Dashboard > Database (Transaction mode, port 6543) |
| `STRIPE_SECRET_KEY` | All | Yes | Stripe Dashboard > API keys |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | All | No | Stripe Dashboard > API keys |
| `STRIPE_WEBHOOK_SECRET` | Production | Yes | Stripe Dashboard > Webhooks |
| `STRIPE_PRO_MONTHLY_PRICE_ID` | All | No | Stripe Dashboard > Products |
| `STRIPE_PRO_ANNUAL_PRICE_ID` | All | No | Stripe Dashboard > Products |
| `STRIPE_PORTFOLIO_MONTHLY_PRICE_ID` | All | No | Stripe Dashboard > Products |
| `STRIPE_PORTFOLIO_ANNUAL_PRICE_ID` | All | No | Stripe Dashboard > Products |
| `RESEND_API_KEY` | All | Yes | Resend Dashboard > API Keys |
| `EMAIL_FROM` | All | No | Your verified sender address |
| `INNGEST_EVENT_KEY` | All | Yes | Inngest Dashboard (or auto-injected via Vercel integration) |
| `INNGEST_SIGNING_KEY` | All | Yes | Inngest Dashboard (or auto-injected via Vercel integration) |
| `SENTRY_DSN` | All | No | Sentry > Project Settings > DSN |
| `SENTRY_AUTH_TOKEN` | All | Yes | Sentry > Auth Tokens |

### Preview Environment Overrides

For Vercel Preview deployments (PR branches), consider:

- Use **Stripe test keys** (`sk_test_`, `pk_test_`) rather than live keys.
- Use a separate Supabase project or branch database to avoid corrupting production data.
- Set `NEXT_PUBLIC_APP_URL` to the Vercel Preview URL pattern or use `VERCEL_URL`.

### Development Environment

For local development, copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

---

## 9. Post-Deployment Verification

After deploying, run through this checklist to confirm everything is working:

### Authentication

- [ ] Visit your deployed URL and confirm the landing page loads.
- [ ] Click **Sign Up** and create a new account via email.
- [ ] Confirm you receive the verification email (check Supabase Auth logs if not).
- [ ] Log in with the new account and verify you are redirected to the dashboard.
- [ ] Log out and confirm you are redirected to the login page.

### Database

- [ ] After logging in, verify the dashboard loads without database errors.
- [ ] Create a new building and confirm it saves successfully.
- [ ] Verify the building appears in the dashboard list.

### Billing (Stripe)

- [ ] Navigate to Settings or Billing and click **Upgrade to Pro**.
- [ ] Confirm you are redirected to a Stripe Checkout page.
- [ ] Complete a test purchase using Stripe test card `4242 4242 4242 4242`.
- [ ] Verify the subscription status updates in the app after checkout.
- [ ] Check Stripe Dashboard > Webhooks for successful event delivery.
- [ ] Test the Stripe Customer Portal link.

### Email (Resend)

- [ ] Trigger an action that sends email (e.g., compliance deadline reminder if configured).
- [ ] Check Resend Dashboard > Emails for delivery status.
- [ ] Verify the email arrives and links point to your production URL.

### Background Jobs (Inngest)

- [ ] Visit the Inngest Dashboard and confirm your app is connected.
- [ ] Verify functions are registered (check the Functions tab).
- [ ] Trigger a test event and confirm it processes successfully.
- [ ] Check the Inngest run history for any failures.

### Error Monitoring (Sentry)

- [ ] Check Sentry for any errors captured during the verification steps above.
- [ ] Optionally trigger a test error to confirm Sentry is receiving events:
  ```javascript
  // Add temporarily to any page, then remove
  throw new Error("Sentry test error - safe to ignore");
  ```
- [ ] Verify source maps are uploaded (stack traces should show original TypeScript code).

### PDF Generation

- [ ] Navigate to a building with compliance data.
- [ ] Generate a compliance report PDF.
- [ ] Verify the PDF downloads correctly and contains the expected data.

### EPA Portfolio Manager Integration

- [ ] Navigate to Portfolio Manager settings.
- [ ] Enter test credentials and verify connection is established.
- [ ] Trigger a property sync and verify properties are imported.

---

## 10. Custom Domain Setup

### 10.1 Add Domain to Vercel

1. Go to **Vercel Dashboard > Your Project > Settings > Domains**.
2. Enter your custom domain (e.g., `app.yourdomain.com` or `yourdomain.com`).
3. Vercel will provide DNS records to configure.

### 10.2 Configure DNS

Add the DNS records provided by Vercel at your domain registrar:

- **For apex domain** (e.g., `yourdomain.com`): Add an `A` record pointing to `76.76.21.21`
- **For subdomain** (e.g., `app.yourdomain.com`): Add a `CNAME` record pointing to `cname.vercel-dns.com`

### 10.3 Wait for SSL

Vercel automatically provisions an SSL certificate via Let's Encrypt. This usually completes within a few minutes after DNS propagation.

### 10.4 Update Service Configurations

After your custom domain is active, update the following:

1. **Vercel environment variable:** Update `NEXT_PUBLIC_APP_URL` to `https://your-domain.com`.
2. **Supabase Auth:** Update the **Site URL** and **Redirect URLs** in Authentication > URL Configuration.
3. **Stripe webhook:** Update the webhook endpoint URL to `https://your-domain.com/api/webhooks/stripe`.
4. **Resend:** Ensure your sending domain matches or is a parent of your app domain.

Trigger a redeployment after updating environment variables:

```bash
# Via Vercel CLI
vercel --prod

# Or push an empty commit
git commit --allow-empty -m "Trigger redeploy after domain setup"
git push
```

---

## 11. Troubleshooting

### Build Failures

- **Missing environment variables:** Vercel build logs will show errors like `STRIPE_SECRET_KEY is not set`. Verify all required variables are configured for the correct environment.
- **TypeScript errors:** Run `npm run build` locally to reproduce. Fix any type errors before pushing.
- **Dependency issues:** Delete `node_modules` and `package-lock.json`, then run `npm install` fresh.

### Database Connection Errors

- **"Connection refused":** Ensure `DATABASE_URL` uses the correct pooler mode. Use port `6543` (Transaction mode) for the application and port `5432` (Session mode) for migrations.
- **"Password authentication failed":** Re-check the database password in your Supabase project settings. Reset it if needed.
- **"Too many connections":** The Transaction pooler (port 6543) handles connection pooling. Make sure you are not using a direct connection (port 5432) in production.

### Stripe Webhook Failures

- **"Webhook signature verification failed":** The `STRIPE_WEBHOOK_SECRET` does not match the endpoint. Each webhook endpoint has its own signing secret. Verify you copied the correct one.
- **Events not arriving:** Check that the webhook endpoint URL is correct and the endpoint is listening for the right event types (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`).

### Auth Issues

- **Redirect loops:** Check that `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set correctly. Verify the Site URL in Supabase matches your deployment URL.
- **"Invalid Refresh Token":** Clear browser cookies and try again. This can occur if Supabase project was reset.

### Inngest Functions Not Running

- **Functions not registered:** Deploy the app and check that the `/api/inngest` endpoint is accessible. Visit `https://your-domain.com/api/inngest` in a browser - it should return a registration response.
- **Signing key mismatch:** Verify `INNGEST_SIGNING_KEY` matches the key in the Inngest Dashboard for your environment.

### PDF Generation Failures

- **Timeout errors:** PDF generation with `@react-pdf/renderer` can be memory-intensive. Increase the function max duration in Vercel settings (Settings > Functions > Max Duration). Consider using a Vercel Pro plan for longer timeouts.
- **Font loading errors:** Ensure any custom fonts are bundled with the application or loaded from a CDN accessible at build time.
