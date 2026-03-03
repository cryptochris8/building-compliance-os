import type { PMProperty, PMMeter, PMConsumptionData } from "./types";
import {
  parsePropertyList,
  parsePropertyDetails,
  parseMeterList,
  parseConsumptionData,
  parseAccountInfo,
  parseErrorResponse,
} from "./xml-parser";

// =======================================
// EPA Portfolio Manager API Client
// Uses HTTP Basic Auth + XML format
// =======================================

const PRODUCTION_BASE_URL = "https://portfoliomanager.energystar.gov/ws";
const TEST_BASE_URL = "https://portfoliomanager.energystar.gov/wstest";

export interface PMClientOptions {
  useTestEnv?: boolean;
  rateLimitMs?: number;
}

export class PMClient {
  private baseUrl: string;
  private authHeader: string | null = null;
  private rateLimitMs: number;
  private lastRequestAt = 0;

  constructor(options?: PMClientOptions) {
    this.baseUrl = options?.useTestEnv ? TEST_BASE_URL : PRODUCTION_BASE_URL;
    this.rateLimitMs = options?.rateLimitMs ?? 1000; // Default 1s between requests
  }

  /**
   * Authenticate with PM API using HTTP Basic Auth.
   * Tests credentials by fetching account info.
   */
  async authenticate(username: string, password: string): Promise<{ accountId: string; username: string }> {
    const credentials = Buffer.from(username + ":" + password).toString("base64");
    this.authHeader = "Basic " + credentials;

    const xml = await this.request("GET", "/account");
    const account = parseAccountInfo(xml);
    if (!account) {
      this.authHeader = null;
      throw new Error("Failed to authenticate with Portfolio Manager");
    }
    return account;
  }

  /** Set authentication directly (pre-authed) */
  setAuth(username: string, password: string): void {
    const credentials = Buffer.from(username + ":" + password).toString("base64");
    this.authHeader = "Basic " + credentials;
  }

  /** GET /property/list - fetch user's properties */
  async getProperties(): Promise<PMProperty[]> {
    const xml = await this.request("GET", "/property/list");
    return parsePropertyList(xml);
  }

  /** GET /property/{id} - fetch property details */
  async getPropertyDetails(propertyId: string): Promise<PMProperty | null> {
    const xml = await this.request("GET", "/property/" + propertyId);
    return parsePropertyDetails(xml);
  }

  /** GET /property/{id}/meter/list - fetch meters for a property */
  async getMeters(propertyId: string): Promise<PMMeter[]> {
    const xml = await this.request("GET", "/property/" + propertyId + "/meter/list");
    return parseMeterList(xml);
  }

  /** GET /meter/{id}/consumptionData - fetch consumption data */
  async getMeterData(
    meterId: string,
    startDate: string,
    endDate: string
  ): Promise<PMConsumptionData[]> {
    const params = new URLSearchParams({
      page: "1",
      startDate,
      endDate,
    });
    const xml = await this.request(
      "GET",
      "/meter/" + meterId + "/consumptionData?" + params.toString()
    );
    return parseConsumptionData(xml);
  }

  /** POST /share/property/{id} - initiate property sharing */
  async shareProperty(
    propertyId: string,
    accountId: string
  ): Promise<{ success: boolean; message: string }> {
    const body = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<share>",
      "  <accountId>" + accountId + "</accountId>",
      "</share>",
    ].join("\n");
    try {
      await this.request("POST", "/share/property/" + propertyId, body);
      return { success: true, message: "Share request sent" };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Share failed";
      return { success: false, message: msg };
    }
  }

  // ======================================
  // Private: HTTP request with rate limiting
  // ======================================

  private async request(
    method: string,
    endpoint: string,
    body?: string
  ): Promise<string> {
    if (!this.authHeader) {
      throw new Error("Not authenticated. Call authenticate() or setAuth() first.");
    }

    // Rate limiting: be gentle with government APIs
    const now = Date.now();
    const timeSinceLast = now - this.lastRequestAt;
    if (timeSinceLast < this.rateLimitMs) {
      await new Promise((resolve) => setTimeout(resolve, this.rateLimitMs - timeSinceLast));
    }
    this.lastRequestAt = Date.now();

    const url = this.baseUrl + endpoint;
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      "Content-Type": "application/xml",
      Accept: "application/xml",
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body || undefined,
    });

    const responseText = await response.text();

    if (!response.ok) {
      const errorMsg = parseErrorResponse(responseText);
      switch (response.status) {
        case 401:
          throw new Error("PM API Authentication failed: Invalid credentials");
        case 403:
          throw new Error("PM API Access denied: " + errorMsg);
        case 404:
          throw new Error("PM API Resource not found: " + endpoint);
        case 500:
          throw new Error("PM API Server error: " + errorMsg);
        default:
          throw new Error("PM API Error (" + response.status + "): " + errorMsg);
      }
    }

    return responseText;
  }
}
