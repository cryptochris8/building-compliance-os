import { pgTable, uuid, text, numeric, integer, boolean, timestamp, date, jsonb, pgEnum, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const subscriptionTierEnum = pgEnum('subscription_tier', ['free', 'pro', 'portfolio', 'enterprise']);
export const userRoleEnum = pgEnum('user_role', ['owner', 'admin', 'member']);
export const utilityTypeEnum = pgEnum('utility_type', ['electricity', 'natural_gas', 'district_steam', 'fuel_oil_2', 'fuel_oil_4']);
export const dataSourceEnum = pgEnum('data_source', ['manual', 'csv_upload', 'portfolio_manager', 'green_button']);
export const confidenceEnum = pgEnum('confidence_level', ['confirmed', 'estimated', 'flagged']);
export const complianceStatusEnum = pgEnum('compliance_status', ['incomplete', 'compliant', 'at_risk', 'over_limit']);
export const importJobStatusEnum = pgEnum('import_job_status', ['pending', 'processing', 'completed', 'failed']);
export const documentTypeEnum = pgEnum('document_type', ['utility_bill', 'compliance_report', 'deduction_form', 'other']);
export const activityTypeEnum = pgEnum('activity_type', ['note', 'status_change', 'calculation', 'document_upload', 'checklist_update', 'lock_change', 'deduction_change']);
export const deductionTypeEnum = pgEnum('deduction_type', ['purchased_recs', 'onsite_renewables', 'community_dg', 'other']);

// Organizations
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  stripeCustomerId: text('stripe_customer_id'),
  subscriptionTier: subscriptionTierEnum('subscription_tier').default('free'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Users
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  role: userRoleEnum('role').default('member'),
  fullName: text('full_name'),
  email: text('email').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_users_org_id').on(table.organizationId),
]);

// Buildings
export const buildings = pgTable('buildings', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  addressLine1: text('address_line1').notNull(),
  addressLine2: text('address_line2'),
  city: text('city').notNull(),
  state: text('state').notNull(),
  zip: text('zip').notNull(),
  borough: text('borough'),
  bbl: text('bbl'),
  bin: text('bin'),
  grossSqft: numeric('gross_sqft').notNull(),
  yearBuilt: integer('year_built'),
  occupancyType: text('occupancy_type').notNull(),
  jurisdictionId: text('jurisdiction_id').notNull().default('nyc-ll97'),
  portfolioManagerId: text('portfolio_manager_id'),
  notes: text('notes'),
  occupancyMix: jsonb('occupancy_mix'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_buildings_org_id').on(table.organizationId),
]);

// Utility Accounts
export const utilityAccounts = pgTable('utility_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  buildingId: uuid('building_id').references(() => buildings.id, { onDelete: 'cascade' }).notNull(),
  accountNumber: text('account_number'),
  utilityType: utilityTypeEnum('utility_type').notNull(),
  providerName: text('provider_name'),
  isTenantPaid: boolean('is_tenant_paid').default(false),
  tenantName: text('tenant_name'),
  tenantUnit: text('tenant_unit'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_utility_accounts_building_id').on(table.buildingId),
]);

// Utility Readings
export const utilityReadings = pgTable('utility_readings', {
  id: uuid('id').primaryKey().defaultRandom(),
  utilityAccountId: uuid('utility_account_id').references(() => utilityAccounts.id, { onDelete: 'cascade' }).notNull(),
  buildingId: uuid('building_id').references(() => buildings.id, { onDelete: 'cascade' }).notNull(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  consumptionValue: numeric('consumption_value').notNull(),
  consumptionUnit: text('consumption_unit').notNull(),
  costDollars: numeric('cost_dollars'),
  source: dataSourceEnum('source').notNull(),
  sourceFileId: uuid('source_file_id'),
  confidence: confidenceEnum('confidence').default('confirmed'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('unique_reading').on(table.utilityAccountId, table.periodStart, table.periodEnd),
  index('idx_utility_readings_building_id').on(table.buildingId),
  index('idx_utility_readings_building_period').on(table.buildingId, table.periodStart, table.periodEnd),
]);

// Compliance Years
export const complianceYears = pgTable('compliance_years', {
  id: uuid('id').primaryKey().defaultRandom(),
  buildingId: uuid('building_id').references(() => buildings.id, { onDelete: 'cascade' }).notNull(),
  year: integer('year').notNull(),
  jurisdictionId: text('jurisdiction_id').notNull(),
  totalEmissionsTco2e: numeric('total_emissions_tco2e'),
  emissionsLimitTco2e: numeric('emissions_limit_tco2e'),
  emissionsOverLimit: numeric('emissions_over_limit'),
  estimatedPenaltyDollars: numeric('estimated_penalty_dollars'),
  status: complianceStatusEnum('status').default('incomplete'),
  dataCompletenessPct: numeric('data_completeness_pct'),
  missingMonths: jsonb('missing_months'),
  reportDueDate: date('report_due_date'),
  reportSubmitted: boolean('report_submitted').default(false),
  reportSubmittedAt: timestamp('report_submitted_at', { withTimezone: true }),
  notes: text('notes'),
  checklistState: jsonb('checklist_state'),
  locked: boolean('locked').default(false),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  lockedBy: uuid('locked_by'),
  lockReason: text('lock_reason'),
  totalDeductionsTco2e: numeric('total_deductions_tco2e'),
  netEmissionsTco2e: numeric('net_emissions_tco2e'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('unique_compliance_year').on(table.buildingId, table.year),
]);

// Documents (Evidence Vault)
export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  buildingId: uuid('building_id').references(() => buildings.id, { onDelete: 'cascade' }).notNull(),
  complianceYearId: uuid('compliance_year_id').references(() => complianceYears.id, { onDelete: 'set null' }),
  fileName: text('file_name').notNull(),
  fileType: text('file_type').notNull(),
  filePath: text('file_path').notNull(),
  fileSizeBytes: integer('file_size_bytes'),
  documentType: documentTypeEnum('document_type'),
  uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_documents_building_id').on(table.buildingId),
  index('idx_documents_compliance_year_id').on(table.complianceYearId),
]);

// Import Jobs
export const importJobs = pgTable('import_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  buildingId: uuid('building_id').references(() => buildings.id, { onDelete: 'set null' }),
  fileName: text('file_name').notNull(),
  filePath: text('file_path').notNull(),
  status: importJobStatusEnum('status').default('pending'),
  rowsTotal: integer('rows_total'),
  rowsImported: integer('rows_imported'),
  rowsFailed: integer('rows_failed'),
  errorLog: jsonb('error_log'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('idx_import_jobs_org_id').on(table.organizationId),
]);

// Phase 4: Compliance Activities
export const complianceActivities = pgTable('compliance_activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  buildingId: uuid('building_id').references(() => buildings.id, { onDelete: 'cascade' }).notNull(),
  complianceYearId: uuid('compliance_year_id').references(() => complianceYears.id, { onDelete: 'set null' }),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'set null' }),
  activityType: activityTypeEnum('activity_type').notNull(),
  description: text('description').notNull(),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_compliance_activities_building_id').on(table.buildingId),
]);

// Phase 4: Deductions
export const deductions = pgTable('deductions', {
  id: uuid('id').primaryKey().defaultRandom(),
  buildingId: uuid('building_id').references(() => buildings.id, { onDelete: 'cascade' }).notNull(),
  complianceYearId: uuid('compliance_year_id').references(() => complianceYears.id, { onDelete: 'cascade' }).notNull(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'set null' }),
  deductionType: deductionTypeEnum('deduction_type').notNull(),
  description: text('description'),
  amountTco2e: numeric('amount_tco2e').notNull(),
  documentationId: uuid('documentation_id').references(() => documents.id, { onDelete: 'set null' }),
  verified: boolean('verified').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_deductions_compliance_year_id').on(table.complianceYearId),
]);

// Relations
export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  buildings: many(buildings),
  importJobs: many(importJobs),
}));

export const usersRelations = relations(users, ({ one }) => ({
  organization: one(organizations, { fields: [users.organizationId], references: [organizations.id] }),
}));

export const buildingsRelations = relations(buildings, ({ one, many }) => ({
  organization: one(organizations, { fields: [buildings.organizationId], references: [organizations.id] }),
  utilityAccounts: many(utilityAccounts),
  utilityReadings: many(utilityReadings),
  complianceYears: many(complianceYears),
  documents: many(documents),
  complianceActivities: many(complianceActivities),
  deductions: many(deductions),
}));

export const utilityAccountsRelations = relations(utilityAccounts, ({ one, many }) => ({
  building: one(buildings, { fields: [utilityAccounts.buildingId], references: [buildings.id] }),
  readings: many(utilityReadings),
}));

export const utilityReadingsRelations = relations(utilityReadings, ({ one }) => ({
  utilityAccount: one(utilityAccounts, { fields: [utilityReadings.utilityAccountId], references: [utilityAccounts.id] }),
  building: one(buildings, { fields: [utilityReadings.buildingId], references: [buildings.id] }),
}));

export const complianceYearsRelations = relations(complianceYears, ({ one, many }) => ({
  building: one(buildings, { fields: [complianceYears.buildingId], references: [buildings.id] }),
  documents: many(documents),
  activities: many(complianceActivities),
  deductions: many(deductions),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  building: one(buildings, { fields: [documents.buildingId], references: [buildings.id] }),
  complianceYear: one(complianceYears, { fields: [documents.complianceYearId], references: [complianceYears.id] }),
  uploader: one(users, { fields: [documents.uploadedBy], references: [users.id] }),
}));

export const complianceActivitiesRelations = relations(complianceActivities, ({ one }) => ({
  building: one(buildings, { fields: [complianceActivities.buildingId], references: [buildings.id] }),
  complianceYear: one(complianceYears, { fields: [complianceActivities.complianceYearId], references: [complianceYears.id] }),
  actor: one(users, { fields: [complianceActivities.actorId], references: [users.id] }),
}));

export const deductionsRelations = relations(deductions, ({ one }) => ({
  building: one(buildings, { fields: [deductions.buildingId], references: [buildings.id] }),
  complianceYear: one(complianceYears, { fields: [deductions.complianceYearId], references: [complianceYears.id] }),
  documentation: one(documents, { fields: [deductions.documentationId], references: [documents.id] }),
}));


// Phase 5: Portfolio Manager
export { pmConnections, pmPropertyMappings, pmConnectionsRelations, pmPropertyMappingsRelations } from './pm';

// Phase 6: Subscriptions / Billing
export { subscriptions, subscriptionStatusEnum, subscriptionsRelations } from './subscriptions';
