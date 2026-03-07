import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { organizations, buildings } from './index';

// PM Connections
export const pmConnections = pgTable('pm_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  pmUsername: text('pm_username').notNull(),
  pmPasswordEncrypted: text('pm_password_encrypted').notNull(),
  connectedAt: timestamp('connected_at', { withTimezone: true }).defaultNow(),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
});

// PM Property Mappings
export const pmPropertyMappings = pgTable('pm_property_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  pmPropertyId: text('pm_property_id').notNull(),
  buildingId: uuid('building_id').references(() => buildings.id, { onDelete: 'set null' }),
  pmPropertyName: text('pm_property_name'),
  linkedAt: timestamp('linked_at', { withTimezone: true }),
});

// Relations
export const pmConnectionsRelations = relations(pmConnections, ({ one }) => ({
  organization: one(organizations, {
    fields: [pmConnections.orgId],
    references: [organizations.id],
  }),
}));

export const pmPropertyMappingsRelations = relations(pmPropertyMappings, ({ one }) => ({
  organization: one(organizations, {
    fields: [pmPropertyMappings.orgId],
    references: [organizations.id],
  }),
  building: one(buildings, {
    fields: [pmPropertyMappings.buildingId],
    references: [buildings.id],
  }),
}));
