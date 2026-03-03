// Simple XML Parser for EPA Portfolio Manager API

import type { PMProperty, PMMeter, PMConsumptionData } from "./types";

function escapeForRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractTag(xml: string, tagName: string): string | null {
  const escaped = escapeForRegex(tagName);
  const pattern = new RegExp(
    "<(?:[a-zA-Z0-9]+:)?" + escaped + "[^>]*>([\\s\\S]*?)</(?:[a-zA-Z0-9]+:)?" + escaped + ">",
    "i"
  );
  const match = xml.match(pattern);
  return match ? match[1].trim() : null;
}

function extractAllTags(xml: string, tagName: string): string[] {
  const escaped = escapeForRegex(tagName);
  const pattern = new RegExp(
    "<(?:[a-zA-Z0-9]+:)?" + escaped + "[^>]*>[\\s\\S]*?</(?:[a-zA-Z0-9]+:)?" + escaped + ">",
    "gi"
  );
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    results.push(match[0]);
  }
  return results;
}

function extractAttribute(xml: string, tagName: string, attrName: string): string | null {
  const escapedTag = escapeForRegex(tagName);
  const escapedAttr = escapeForRegex(attrName);
  const pattern = new RegExp(
    "<(?:[a-zA-Z0-9]+:)?" + escapedTag + '[^>]*\\s' + escapedAttr + '="([^"]*)"',
    "i"
  );
  const match = xml.match(pattern);
  return match ? match[1] : null;
}

function parsePropertyBlock(block: string): PMProperty {
  return {
    id: extractTag(block, "propertyId") || extractAttribute(block, "property", "id") || "",
    name: extractTag(block, "name") || "",
    address: extractTag(block, "address1") || "",
    city: extractTag(block, "city") || "",
    state: extractTag(block, "state") || "",
    postalCode: extractTag(block, "postalCode") || "",
    grossFloorArea: parseFloat(extractTag(block, "value") || "0") || 0,
    yearBuilt: parseInt(extractTag(block, "yearBuilt") || "0") || 0,
    primaryFunction: extractTag(block, "primaryFunction") || "",
  };
}

export function parsePropertyList(xml: string): PMProperty[] {
  const properties: PMProperty[] = [];
  const propertyBlocks = extractAllTags(xml, "property");

  if (propertyBlocks.length === 0) {
    const linkBlocks = extractAllTags(xml, "link");
    for (const link of linkBlocks) {
      const href = extractAttribute(link, "link", "href") || extractTag(link, "href");
      const hint = extractAttribute(link, "link", "hint") || extractTag(link, "hint") || "";
      if (href) {
        const idMatch = href.match(/\/property\/(\d+)/);
        if (idMatch) {
          properties.push({
            id: idMatch[1], name: hint || "Property " + idMatch[1],
            address: "", city: "", state: "", postalCode: "",
            grossFloorArea: 0, yearBuilt: 0, primaryFunction: "",
          });
        }
      }
    }
    return properties;
  }

  for (const block of propertyBlocks) {
    properties.push(parsePropertyBlock(block));
  }
  return properties;
}

export function parsePropertyDetails(xml: string): PMProperty | null {
  const id = extractTag(xml, "propertyId") || extractAttribute(xml, "property", "id") || "";
  if (!id) return null;
  return parsePropertyBlock(xml);
}

export function parseMeterList(xml: string): PMMeter[] {
  const meters: PMMeter[] = [];
  const meterBlocks = extractAllTags(xml, "meter");

  if (meterBlocks.length === 0) {
    const linkBlocks = extractAllTags(xml, "link");
    for (const link of linkBlocks) {
      const href = extractAttribute(link, "link", "href") || extractTag(link, "href");
      const hint = extractAttribute(link, "link", "hint") || extractTag(link, "hint") || "";
      if (href) {
        const idMatch = href.match(/\/meter\/(\d+)/);
        if (idMatch) {
          meters.push({
            id: idMatch[1], type: hint || "Unknown",
            name: hint || "Meter " + idMatch[1],
            unitOfMeasure: "", firstBillDate: "", inUse: true,
          });
        }
      }
    }
    return meters;
  }

  for (const block of meterBlocks) {
    meters.push({
      id: extractTag(block, "meterId") || extractAttribute(block, "meter", "id") || "",
      type: extractTag(block, "type") || "",
      name: extractTag(block, "name") || "",
      unitOfMeasure: extractTag(block, "unitOfMeasure") || "",
      firstBillDate: extractTag(block, "firstBillDate") || "",
      inUse: extractTag(block, "inUse") !== "false",
    });
  }
  return meters;
}

export function parseConsumptionData(xml: string): PMConsumptionData[] {
  const dataPoints: PMConsumptionData[] = [];
  let entryBlocks = extractAllTags(xml, "meterConsumption");
  if (entryBlocks.length === 0) {
    entryBlocks = extractAllTags(xml, "meterData");
  }
  for (const block of entryBlocks) {
    dataPoints.push({
      startDate: extractTag(block, "startDate") || "",
      endDate: extractTag(block, "endDate") || "",
      usage: parseFloat(extractTag(block, "usage") || "0") || 0,
      cost: parseFloat(extractTag(block, "cost") || "0") || 0,
      unit: extractTag(block, "unitOfMeasure") || "",
    });
  }
  return dataPoints;
}

export function parseAccountInfo(xml: string): { accountId: string; username: string } | null {
  const accountId = extractTag(xml, "id") || extractTag(xml, "accountId") || "";
  const username = extractTag(xml, "username") || "";
  if (!accountId && !username) return null;
  return { accountId, username };
}

export function parseErrorResponse(xml: string): string {
  return (
    extractTag(xml, "errorDescription") ||
    extractTag(xml, "error") ||
    extractTag(xml, "message") ||
    "Unknown error from Portfolio Manager API"
  );
}
