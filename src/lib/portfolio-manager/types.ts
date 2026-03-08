// ============================================================
// EPA Portfolio Manager API Types
// ============================================================

export interface PMProperty {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  grossFloorArea: number;
  yearBuilt: number;
  primaryFunction: string;
}

export interface PMMeter {
  id: string;
  type: string;
  name: string;
  unitOfMeasure: string;
  firstBillDate: string;
  inUse: boolean;
}

export interface PMConsumptionData {
  startDate: string;
  endDate: string;
  usage: number;
  cost: number;
  unit: string;
}

export interface PMShareResponse {
  success: boolean;
  shareId?: string;
  message?: string;
}

export interface PMPropertyList {
  properties: PMProperty[];
}

export interface PMMeterList {
  meters: PMMeter[];
}

export interface PMConsumptionDataList {
  meterConsumption: PMConsumptionData[];
}

export interface PMAccountInfo {
  accountId: string;
  username: string;
}

export interface PMConnectionStatus {
  connected: boolean;
  username?: string;
  propertyCount?: number;
  lastSyncAt?: string;
  error?: string;
}

/** Maps PM meter types to our local utility types */
export const PM_METER_TYPE_MAP: Record<string, string> = {
  'Electric': 'electricity',
  'Electric - Grid': 'electricity',
  'Electric - Grid Purchase': 'electricity',
  'Electric - On Site Solar': 'electricity',
  'Natural Gas': 'natural_gas',
  'District Steam': 'district_steam',
  'Fuel Oil (No. 2)': 'fuel_oil_2',
  'Fuel Oil (No. 4)': 'fuel_oil_4',
  'Fuel Oil No 2': 'fuel_oil_2',
  'Fuel Oil No 4': 'fuel_oil_4',
};

/** Maps PM units to our local units */
export const PM_UNIT_MAP: Record<string, string> = {
  'kWh (thousand Watt-hours)': 'kWh',
  'kWh': 'kWh',
  'MWh (million Watt-hours)': 'MWh',
  'therms': 'therms',
  'kBtu (thousand Btu)': 'kBtu',
  'ccf (hundred cubic feet)': 'ccf',
  'Mlb (thousand pounds)': 'Mlb',
  'Gallons (US)': 'gallons',
  'gallons': 'gallons',
  'GJ': 'GJ', // 1 GJ = 947.817 kBtu, conversion applied in sync.ts
};
