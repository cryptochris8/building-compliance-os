-- ============================================================
-- Repair migration: add foreign-key / lookup indexes that the Drizzle
-- schema (src/lib/db/schema) declares but that were never created on
-- this database. The DB was bootstrapped via drizzle-kit push /
-- hand-applied SQL, so most secondary indexes from the initial schema
-- are missing — every org_id / building_id filter is currently a
-- sequential scan.
--
-- All statements are idempotent (IF NOT EXISTS) — safe on any
-- environment, including a fresh DB where the initial migration
-- already created these.
-- ============================================================

create index if not exists idx_users_org_id
  on public.users (organization_id);

create index if not exists idx_buildings_org_id
  on public.buildings (organization_id);

create index if not exists idx_utility_accounts_building_id
  on public.utility_accounts (building_id);

create index if not exists idx_utility_readings_building_id
  on public.utility_readings (building_id);

create index if not exists idx_utility_readings_building_period
  on public.utility_readings (building_id, period_start, period_end);

create index if not exists idx_documents_building_id
  on public.documents (building_id);

create index if not exists idx_documents_compliance_year_id
  on public.documents (compliance_year_id);

create index if not exists idx_import_jobs_org_id
  on public.import_jobs (organization_id);

create index if not exists idx_compliance_activities_building_id
  on public.compliance_activities (building_id);

create index if not exists idx_deductions_compliance_year_id
  on public.deductions (compliance_year_id);

create index if not exists idx_subscriptions_org_id
  on public.subscriptions (org_id);
