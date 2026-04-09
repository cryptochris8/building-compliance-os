/**
 * Shared color and label constants for fuel/utility types used across chart components.
 *
 * FUEL_COLORS uses CSS custom properties (`var(--chart-*)`) so they automatically
 * adapt to light/dark mode as defined in globals.css.  The fallback hex values
 * match the light-mode OKLch values and are only used in environments where CSS
 * variables are not resolvable (e.g. server-side rendering, jest snapshots).
 *
 * Palette is colorblind-safe: no two adjacent fuel types rely on red vs. green
 * alone to be distinguished.  Each entry has a unique hue AND lightness in both
 * light and dark mode.
 *
 *   chart-1  blue   — electricity
 *   chart-2  teal   — district_steam
 *   chart-3  amber  — natural_gas
 *   chart-4  violet — fuel_oil_4
 *   chart-5  orange — fuel_oil_2 / fuel_oil
 */
export const FUEL_COLORS: Record<string, string> = {
  electricity:    "var(--color-chart-1, #3b7dd8)",
  district_steam: "var(--color-chart-2, #2db3a0)",
  natural_gas:    "var(--color-chart-3, #c99a2e)",
  fuel_oil_4:     "var(--color-chart-4, #8e52c8)",
  fuel_oil_2:     "var(--color-chart-5, #c46d28)",
  fuel_oil:       "var(--color-chart-5, #c46d28)", // alias used by reading charts (combined fuel oil)
};

export const FUEL_LABELS: Record<string, string> = {
  electricity:    "Electricity",
  natural_gas:    "Natural Gas",
  district_steam: "District Steam",
  fuel_oil_2:     "Fuel Oil #2",
  fuel_oil_4:     "Fuel Oil #4",
  fuel_oil:       "Fuel Oil", // alias used by reading charts (combined fuel oil)
};
