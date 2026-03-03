"use server";

import { db } from "@/lib/db";
import { users, pmConnections, pmPropertyMappings, buildings } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PMClient } from "@/lib/portfolio-manager/client";
import { syncProperties, syncMeterData } from "@/lib/portfolio-manager/sync";

async function getAuthUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function getUserOrgId(): Promise<string | null> {
  const authUser = await getAuthUser();
  if (!authUser) return null;
  const [dbUser] = await db.select({ organizationId: users.organizationId })
    .from(users).where(eq(users.id, authUser.id)).limit(1);
  return dbUser?.organizationId || null;
}

export async function connectPM(formData: FormData) {
  const orgId = await getUserOrgId();
  if (!orgId) return { error: "Unauthorized" };

  const username = formData.get("username") as string;
  const password = formData.get("password") as string;
  if (!username || !password) return { error: "Username and password required" };

  try {
    const client = new PMClient();
    await client.authenticate(username, password);

    const existing = await db.select().from(pmConnections)
      .where(eq(pmConnections.orgId, orgId)).limit(1);

    if (existing.length > 0) {
      await db.update(pmConnections).set({
        pmUsername: username,
        pmPasswordEncrypted: password,
        connectedAt: new Date(),
      }).where(eq(pmConnections.id, existing[0].id));
    } else {
      await db.insert(pmConnections).values({
        orgId,
        pmUsername: username,
        pmPasswordEncrypted: password,
      });
    }

    revalidatePath("/settings/portfolio-manager");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection failed";
    return { error: message };
  }
}

export async function disconnectPM() {
  const orgId = await getUserOrgId();
  if (!orgId) return { error: "Unauthorized" };

  await db.delete(pmConnections).where(eq(pmConnections.orgId, orgId));
  revalidatePath("/settings/portfolio-manager");
  return { success: true };
}

export async function syncPMProperties() {
  const orgId = await getUserOrgId();
  if (!orgId) return { error: "Unauthorized" };

  try {
    const properties = await syncProperties(orgId);
    revalidatePath("/settings/portfolio-manager");
    return { success: true, count: properties.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return { error: message };
  }
}

export async function linkProperty(pmPropertyId: string, buildingId: string) {
  const orgId = await getUserOrgId();
  if (!orgId) return { error: "Unauthorized" };

  const [mapping] = await db.select().from(pmPropertyMappings)
    .where(and(eq(pmPropertyMappings.orgId, orgId), eq(pmPropertyMappings.pmPropertyId, pmPropertyId)))
    .limit(1);

  if (!mapping) return { error: "Property mapping not found" };

  await db.update(pmPropertyMappings).set({
    buildingId,
    linkedAt: new Date(),
  }).where(eq(pmPropertyMappings.id, mapping.id));

  revalidatePath("/settings/portfolio-manager");
  return { success: true };
}

export async function unlinkProperty(pmPropertyId: string) {
  const orgId = await getUserOrgId();
  if (!orgId) return { error: "Unauthorized" };

  const [mapping] = await db.select().from(pmPropertyMappings)
    .where(and(eq(pmPropertyMappings.orgId, orgId), eq(pmPropertyMappings.pmPropertyId, pmPropertyId)))
    .limit(1);

  if (!mapping) return { error: "Property mapping not found" };

  await db.update(pmPropertyMappings).set({
    buildingId: null,
    linkedAt: null,
  }).where(eq(pmPropertyMappings.id, mapping.id));

  revalidatePath("/settings/portfolio-manager");
  return { success: true };
}

export async function importMeterData(pmPropertyId: string, buildingId: string) {
  const orgId = await getUserOrgId();
  if (!orgId) return { error: "Unauthorized" };

  try {
    const result = await syncMeterData(buildingId, pmPropertyId, orgId);
    revalidatePath("/buildings/" + buildingId + "/readings");
    return { success: true, imported: result.importedCount, meters: result.metersCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    return { error: message };
  }
}

export async function getPMConnection() {
  const orgId = await getUserOrgId();
  if (!orgId) return null;

  const [conn] = await db.select({
    id: pmConnections.id,
    pmUsername: pmConnections.pmUsername,
    connectedAt: pmConnections.connectedAt,
    lastSyncAt: pmConnections.lastSyncAt,
  }).from(pmConnections).where(eq(pmConnections.orgId, orgId)).limit(1);

  return conn || null;
}

export async function getPMPropertyMappings() {
  const orgId = await getUserOrgId();
  if (!orgId) return [];

  const mappings = await db.select({
    id: pmPropertyMappings.id,
    pmPropertyId: pmPropertyMappings.pmPropertyId,
    pmPropertyName: pmPropertyMappings.pmPropertyName,
    buildingId: pmPropertyMappings.buildingId,
    linkedAt: pmPropertyMappings.linkedAt,
  }).from(pmPropertyMappings).where(eq(pmPropertyMappings.orgId, orgId));

  return mappings;
}

export async function getOrgBuildings() {
  const orgId = await getUserOrgId();
  if (!orgId) return [];

  const orgBuildings = await db.select({
    id: buildings.id,
    name: buildings.name,
    addressLine1: buildings.addressLine1,
  }).from(buildings).where(eq(buildings.organizationId, orgId));

  return orgBuildings;
}
