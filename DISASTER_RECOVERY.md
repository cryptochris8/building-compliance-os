# Disaster Recovery Runbook

Operational procedures for restoring service after data loss or outage.

## Targets

| Metric | Target | Notes |
|---|---|---|
| RPO (recovery point objective) | 24 hours | Worst-case data loss tolerated |
| RTO (recovery time objective) | 4 hours | Time from incident detection to service restored |
| Backup frequency | Daily (automated by Supabase) | Plus on-demand before risky migrations |
| Backup retention | 7 days (free tier) / 30 days (Pro) | Configure to match plan |

## What's backed up

| Asset | Provider | Mechanism | Where to restore |
|---|---|---|---|
| Postgres database | Supabase | Daily PITR (Point-in-Time Recovery) | Supabase Dashboard → Database → Backups |
| File storage (documents) | Supabase Storage | Replicated within region | Bucket-level restore via Supabase support |
| Stripe customer/subscription state | Stripe | Source of truth in Stripe | Re-sync via webhook replay |
| Auth users | Supabase Auth | Same as DB (auth.users table) | Restored with DB |
| Application code | GitHub | Git history | Re-deploy via Vercel |
| Secrets (env vars) | Vercel + 1Password (recommended) | Manual export | Re-paste into Vercel dashboard |

## Pre-incident checklist (do once, monthly)

- [ ] Confirm Supabase backups are enabled and successful: Dashboard → Database → Backups → most recent should be < 24h old.
- [ ] Export current Vercel env vars to 1Password (or equivalent) — secrets are NOT in Git.
- [ ] Run a test restore to a staging project at least once per quarter (see procedure below).
- [ ] Confirm Stripe webhook signing secret rotation procedure is documented in your password manager.

## Incident response

### Step 0 — Triage (5 minutes)

1. Confirm the incident: check Sentry, the `/dashboard` route, and the Supabase status page.
2. Classify:
   - **Data corruption / loss** → DB restore (Step 1)
   - **Region outage** → Wait for Supabase recovery; do NOT trigger restore (creates split-brain)
   - **Bad deploy** → Vercel rollback to previous deployment (Step 2)
   - **Compromised secret** → Rotation (Step 3)
3. Post in `#incidents`, page on-call, start an incident doc with timestamps.

### Step 1 — Database restore from PITR

> Supabase PITR restores create a NEW project. You must re-point the app at the new connection string.

1. **Snapshot the broken state first** (forensics): `pg_dump` from current DB to a local file. Don't skip this.
2. In Supabase Dashboard → Database → Backups, click **Restore**, pick the timestamp BEFORE the incident.
3. Wait for the new project to provision (~5–15 minutes).
4. In the new project, copy the new `DATABASE_URL` from Settings → Database.
5. In Vercel → Project → Environment Variables, update `DATABASE_URL` (Production environment only).
6. **Trigger redeploy**: Vercel → Deployments → ⋯ on latest → Redeploy. Wait for green.
7. Smoke test: log in, list buildings, view one compliance year, generate a report.
8. **Re-sync Stripe**: in the Stripe Dashboard → Webhooks → your endpoint → Send test event for `customer.subscription.updated` to re-hydrate subscription rows for any orgs that signed up between the restore point and now (these will be missing from the restored DB).
9. Post-mortem within 48 hours.

### Step 2 — Vercel deploy rollback

1. Vercel Dashboard → your project → Deployments.
2. Find the last known-good deploy (green check, before the incident).
3. ⋯ menu → **Promote to Production**.
4. Verify `/api/healthz` (if added) or `/dashboard` loads in <2 seconds.
5. Investigate the bad commit; do NOT redeploy without a fix.

### Step 3 — Secret rotation (compromised env var)

For any of `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY`, `ENCRYPTION_KEY`, `UPSTASH_REDIS_REST_TOKEN`:

1. **Rotate at the source first** (Stripe / Resend / Inngest / Supabase / Upstash dashboards).
2. Update the value in Vercel → Environment Variables → Production.
3. Trigger redeploy (or use Vercel CLI: `vercel env pull && vercel deploy --prod`).
4. **Verify the old value is rejected**: e.g., `curl` Stripe with the old key should 401.
5. **`ENCRYPTION_KEY` is special**: rotating it makes EXISTING encrypted values un-decryptable. Before rotating, decrypt all `pmConnections.pmPasswordEncrypted` rows with the old key, re-encrypt with the new key, write back, THEN swap the env var. Plan a maintenance window.

### Step 4 — File storage loss

Supabase Storage is replicated within the region; full bucket loss is rare. If it happens:

1. Open a support ticket with Supabase immediately — they can often restore from internal snapshots.
2. The app degrades gracefully: building/reading metadata stays in Postgres; only document downloads will 404.
3. Surface a banner via a feature flag (or a temp commit) explaining: "Document storage is being restored — uploads work, older downloads may be unavailable."

## Test restore procedure (run quarterly)

1. In Supabase, create a new throwaway project named `bcos-dr-test-YYYY-MM`.
2. Restore production's most recent backup INTO the throwaway project.
3. Pull the throwaway `DATABASE_URL` into a local `.env.test`.
4. `npm run build && npm start` against the throwaway DB.
5. Smoke test: login, list buildings, view one compliance year.
6. Time-box: total elapsed should be under the 4-hour RTO. If it isn't, tune.
7. Delete the throwaway project. Document elapsed time + any friction in `audit-reports/dr-test-YYYY-MM.md`.

## Out of scope (accept the risk)

- Multi-region failover. Supabase free/Pro is single-region. Buy Supabase Enterprise or self-host if this becomes a requirement.
- Real-time backups < 24h RPO. Requires Supabase add-on or external WAL streaming.
- Customer-initiated GDPR export/delete. Manual via Supabase dashboard until built into the product.
