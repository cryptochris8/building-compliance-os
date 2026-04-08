/**
 * Shared color and label constants for fuel/utility types used across chart components.
 */

export const FUEL_COLORS: Record<string, string> = {
  electricity: "#3b82f6",
  natural_gas: "#f97316",
  district_steam: "#8b5cf6",
  fuel_oil_2: "#ef4444",
  fuel_oil_4: "#f43f5e",
  fuel_oil: "#ef4444", // alias used by reading charts (combined fuel oil)
};

export const FUEL_LABELS: Record<string, string> = {
  electricity: "Electricity",
  natural_gas: "Natural Gas",
  district_steam: "District Steam",
  fuel_oil_2: "Fuel Oil #2",
  fuel_oil_4: "Fuel Oil #4",
  fuel_oil: "Fuel Oil", // alias used by reading charts (combined fuel oil)
};
