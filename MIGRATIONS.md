# Database Migrations

This project uses **Drizzle migrations as the canonical source of truth** for table shape, columns, indexes, and foreign keys. Supabase migrations are reserved for things Drizzle cannot model (Row-Level Security, Postgres functions, custom triggers).

## Layout

```
drizzle.config.ts              # Drizzle config — points to schema and out dir
src/lib/db/schema/             # Schema as TypeScript (the source of truth)
  index.ts                     # Tables, enums, relations
  pm.ts, subscriptions.ts      # Domain-specific tables
src/lib/db/migrations/         # Generated SQL — DO NOT hand-edit
  0000_*.sql                   # Each `npm run db:generate` adds one file
  meta/_journal.json           # Drizzle's applied-migration tracker
supabase/migrations/           # Hand-written SQL for things Drizzle can't generate
  001_enable_rls.sql           # RLS policies (required)
```

## Day-to-day workflow

### Editing schema

1. Edit `src/lib/db/schema/index.ts` (or related files in that folder).
2. Run `npm run db:generate` to produce a new SQL file in `src/lib/db/migrations/`.
3. Inspect the generated SQL and commit both the schema change and the migration together. Never edit the generated SQL by hand — re-generate.
4. On deploy, `npm run db:migrate` applies any new migrations.

### Adding RLS / functions / Supabase-specific changes

Hand-write a new file under `supabase/migrations/NNN_description.sql` and apply it via the Supabase Dashboard SQL editor, the Supabase CLI, or `psql`. These are NOT applied by `drizzle-kit migrate`.

## First-time setup (new environment)

```bash
# 1. Drizzle creates tables
npm run db:migrate

# 2. Apply Supabase migrations (RLS) via Supabase Dashboard SQL editor
#    or via Supabase CLI:
#    supabase db push
```

## Bootstrapping an existing database

If the schema already exists in the database (created by `drizzle-kit push` or manual SQL during early development), you need to mark the baseline migration as already-applied so `drizzle-kit migrate` doesn't re-run it:

```sql
-- Run once against the production database
CREATE SCHEMA IF NOT EXISTS drizzle;

CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id           SERIAL PRIMARY KEY,
  hash         TEXT NOT NULL,
  created_at   BIGINT
);

-- Mark migration 0000 as applied. The hash is the SHA-256 of the migration's
-- statements joined by newline; copy from src/lib/db/migrations/meta/_journal.json
-- (the `tag` and `when` fields together identify the migration).
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
SELECT
  (SELECT hash FROM jsonb_to_recordset((
    SELECT jsonb FROM (VALUES (
      '[]'::jsonb -- replace with content of _journal.json
    )) AS t(jsonb)
  )) AS x(hash text)),
  EXTRACT(EPOCH FROM NOW()) * 1000;
```

In practice: easier to drop the dev DB and run `npm run db:migrate` from scratch, OR run the journal-insert via the Drizzle Studio / a one-off script. Document the actual hash you used in the project's deploy notes.

## Don't do this

- **Never** edit a migration file after it has been committed and applied to any environment. Generate a new one instead.
- **Never** mix `drizzle-kit push` (dev convenience) with `drizzle-kit migrate` in the same database. Pick one per environment.
- **Never** hand-add columns or constraints to a migration file. The diff between schema and migration must stay clean so future `db:generate` runs don't produce surprising deltas.

## CI

- `npm run db:generate` should produce no diff in CI. If it does, the schema and migrations are out of sync — fail the build and ask the developer to regenerate.
- `npm run db:migrate` should never run against production from CI without an explicit gate; run it from the deploy step (or manually) instead.
