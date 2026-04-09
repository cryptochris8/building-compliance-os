CREATE TYPE "public"."activity_type" AS ENUM('note', 'status_change', 'calculation', 'document_upload', 'checklist_update', 'lock_change', 'deduction_change');--> statement-breakpoint
CREATE TYPE "public"."compliance_status" AS ENUM('incomplete', 'compliant', 'at_risk', 'over_limit');--> statement-breakpoint
CREATE TYPE "public"."confidence_level" AS ENUM('confirmed', 'estimated', 'flagged');--> statement-breakpoint
CREATE TYPE "public"."data_source" AS ENUM('manual', 'csv_upload', 'portfolio_manager', 'green_button');--> statement-breakpoint
CREATE TYPE "public"."deduction_type" AS ENUM('purchased_recs', 'onsite_renewables', 'community_dg', 'other');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('utility_bill', 'compliance_report', 'deduction_form', 'other');--> statement-breakpoint
CREATE TYPE "public"."import_job_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid');--> statement-breakpoint
CREATE TYPE "public"."subscription_tier" AS ENUM('free', 'pro', 'portfolio', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."utility_type" AS ENUM('electricity', 'natural_gas', 'district_steam', 'fuel_oil_2', 'fuel_oil_4');--> statement-breakpoint
CREATE TABLE "buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"zip" text NOT NULL,
	"borough" text,
	"bbl" text,
	"bin" text,
	"gross_sqft" numeric NOT NULL,
	"year_built" integer,
	"occupancy_type" text NOT NULL,
	"jurisdiction_id" text DEFAULT 'nyc-ll97' NOT NULL,
	"portfolio_manager_id" text,
	"notes" text,
	"occupancy_mix" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "compliance_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"compliance_year_id" uuid,
	"org_id" uuid,
	"activity_type" "activity_type" NOT NULL,
	"description" text NOT NULL,
	"actor_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "compliance_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"jurisdiction_id" text NOT NULL,
	"total_emissions_tco2e" numeric,
	"emissions_limit_tco2e" numeric,
	"emissions_over_limit" numeric,
	"estimated_penalty_dollars" numeric,
	"status" "compliance_status" DEFAULT 'incomplete',
	"data_completeness_pct" numeric,
	"missing_months" jsonb,
	"report_due_date" date,
	"report_submitted" boolean DEFAULT false,
	"report_submitted_at" timestamp with time zone,
	"notes" text,
	"checklist_state" jsonb,
	"locked" boolean DEFAULT false,
	"locked_at" timestamp with time zone,
	"locked_by" uuid,
	"lock_reason" text,
	"total_deductions_tco2e" numeric,
	"net_emissions_tco2e" numeric,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "deductions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"compliance_year_id" uuid NOT NULL,
	"org_id" uuid,
	"deduction_type" "deduction_type" NOT NULL,
	"description" text,
	"amount_tco2e" numeric NOT NULL,
	"documentation_id" uuid,
	"verified" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"compliance_year_id" uuid,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"file_path" text NOT NULL,
	"file_size_bytes" integer,
	"document_type" "document_type",
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"building_id" uuid,
	"file_name" text NOT NULL,
	"file_path" text NOT NULL,
	"status" "import_job_status" DEFAULT 'pending',
	"rows_total" integer,
	"rows_imported" integer,
	"rows_failed" integer,
	"error_log" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"stripe_customer_id" text,
	"subscription_tier" "subscription_tier" DEFAULT 'free',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pm_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"pm_username" text NOT NULL,
	"pm_password_encrypted" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now(),
	"last_sync_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pm_property_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"pm_property_id" text NOT NULL,
	"building_id" uuid,
	"pm_property_name" text,
	"linked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"price_id" text NOT NULL,
	"status" "subscription_status" DEFAULT 'trialing' NOT NULL,
	"trial_end" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"role" "user_role" DEFAULT 'member',
	"full_name" text,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "utility_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"account_number" text,
	"utility_type" "utility_type" NOT NULL,
	"provider_name" text,
	"is_tenant_paid" boolean DEFAULT false,
	"tenant_name" text,
	"tenant_unit" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "utility_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utility_account_id" uuid NOT NULL,
	"building_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"consumption_value" numeric NOT NULL,
	"consumption_unit" text NOT NULL,
	"cost_dollars" numeric,
	"source" "data_source" NOT NULL,
	"source_file_id" uuid,
	"confidence" "confidence_level" DEFAULT 'confirmed',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_activities" ADD CONSTRAINT "compliance_activities_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_activities" ADD CONSTRAINT "compliance_activities_compliance_year_id_compliance_years_id_fk" FOREIGN KEY ("compliance_year_id") REFERENCES "public"."compliance_years"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_activities" ADD CONSTRAINT "compliance_activities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_activities" ADD CONSTRAINT "compliance_activities_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_years" ADD CONSTRAINT "compliance_years_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deductions" ADD CONSTRAINT "deductions_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deductions" ADD CONSTRAINT "deductions_compliance_year_id_compliance_years_id_fk" FOREIGN KEY ("compliance_year_id") REFERENCES "public"."compliance_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deductions" ADD CONSTRAINT "deductions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deductions" ADD CONSTRAINT "deductions_documentation_id_documents_id_fk" FOREIGN KEY ("documentation_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_compliance_year_id_compliance_years_id_fk" FOREIGN KEY ("compliance_year_id") REFERENCES "public"."compliance_years"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_connections" ADD CONSTRAINT "pm_connections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_property_mappings" ADD CONSTRAINT "pm_property_mappings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_property_mappings" ADD CONSTRAINT "pm_property_mappings_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utility_accounts" ADD CONSTRAINT "utility_accounts_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utility_readings" ADD CONSTRAINT "utility_readings_utility_account_id_utility_accounts_id_fk" FOREIGN KEY ("utility_account_id") REFERENCES "public"."utility_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utility_readings" ADD CONSTRAINT "utility_readings_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_buildings_org_id" ON "buildings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_compliance_activities_building_id" ON "compliance_activities" USING btree ("building_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_compliance_year" ON "compliance_years" USING btree ("building_id","year");--> statement-breakpoint
CREATE INDEX "idx_deductions_compliance_year_id" ON "deductions" USING btree ("compliance_year_id");--> statement-breakpoint
CREATE INDEX "idx_documents_building_id" ON "documents" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "idx_documents_compliance_year_id" ON "documents" USING btree ("compliance_year_id");--> statement-breakpoint
CREATE INDEX "idx_import_jobs_org_id" ON "import_jobs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_org_id" ON "subscriptions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_stripe_sub_id" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "idx_users_org_id" ON "users" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_utility_accounts_building_id" ON "utility_accounts" USING btree ("building_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_reading" ON "utility_readings" USING btree ("utility_account_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "idx_utility_readings_building_id" ON "utility_readings" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "idx_utility_readings_building_period" ON "utility_readings" USING btree ("building_id","period_start","period_end");