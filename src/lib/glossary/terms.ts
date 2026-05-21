export type GlossaryCategory = 'regulations' | 'metrics' | 'identifiers' | 'statuses' | 'concepts';

export interface GlossaryTerm {
  id: string;
  label: string;
  category: GlossaryCategory;
  definition: string;
  example?: string;
}

export const glossaryTerms: GlossaryTerm[] = [
  // Regulations
  {
    id: 'll97',
    label: 'LL97',
    category: 'regulations',
    definition:
      'NYC Local Law 97 (2019) caps carbon emissions for buildings over 25,000 sq ft. Limits tighten in 2024 and again in 2030; non-compliance triggers penalties of $268 per metric ton over the limit.',
    example: 'A 100,000 sq ft NYC office building has an annual LL97 emissions limit that gets stricter every compliance period.',
  },
  {
    id: 'berdo',
    label: 'BERDO',
    category: 'regulations',
    definition:
      "Boston's Building Emissions Reduction and Disclosure Ordinance. Requires owners of buildings over 20,000 sq ft to report annual energy use and meet emissions standards that reach net-zero by 2050.",
  },
  {
    id: 'reporting-deadline',
    label: 'Reporting Deadline',
    category: 'regulations',
    definition:
      'The jurisdiction-specific date by which a building owner must submit the annual compliance report. For NYC LL97 this is May 1 of the year following the reporting year.',
  },

  // Metrics
  {
    id: 'tco2e',
    label: 'tCO₂e',
    category: 'metrics',
    definition:
      'Metric tons of carbon-dioxide equivalent — a unit that converts all greenhouse gases (methane, refrigerants, etc.) into the amount of CO₂ that would cause the same warming. Compliance limits and penalties are expressed in tCO₂e.',
    example: 'A building that burns 10,000 therms of natural gas emits about 53 tCO₂e.',
  },
  {
    id: 'emissions-limit',
    label: 'Emissions Limit',
    category: 'metrics',
    definition:
      "The maximum tCO₂e a building may emit in a given compliance year. Derived from the building's occupancy type(s), gross square footage, and the jurisdiction's emissions intensity factors.",
  },
  {
    id: 'eui',
    label: 'EUI',
    category: 'metrics',
    definition:
      'Energy Use Intensity — a building\'s energy consumption per square foot, usually expressed as kBtu/sq ft/year. Lower EUI means a more efficient building.',
  },
  {
    id: 'site-energy',
    label: 'Site Energy',
    category: 'metrics',
    definition:
      "The energy actually consumed at the building (electricity from the meter, gas from the service line). Distinct from source energy, which includes generation and transmission losses upstream of the meter.",
  },
  {
    id: 'data-completeness',
    label: 'Data Completeness',
    category: 'metrics',
    definition:
      'The percentage of the compliance year for which utility consumption data has been entered. A full year with no gaps is 100%. Calculations on incomplete data are flagged as estimated.',
  },

  // Identifiers
  {
    id: 'bbl',
    label: 'BBL',
    category: 'identifiers',
    definition:
      "NYC Borough-Block-Lot identifier — a 10-digit tax-lot number used across most NYC municipal systems (DOF, DOB, LL97 enforcement). Format: 1 borough digit + 5 block digits + 4 lot digits.",
    example: '1012340056 — Manhattan, block 1234, lot 56.',
  },
  {
    id: 'bin',
    label: 'BIN',
    category: 'identifiers',
    definition:
      'NYC Building Identification Number — a 7-digit number the Department of Buildings assigns to each physical structure. A single tax lot (BBL) can contain multiple BINs.',
  },
  {
    id: 'gross-sqft',
    label: 'Gross Square Footage',
    category: 'identifiers',
    definition:
      'Total floor area measured from the outside of exterior walls, including all conditioned and unconditioned space. This is the denominator for most emissions and energy intensity calculations.',
  },
  {
    id: 'occupancy-type',
    label: 'Occupancy Type',
    category: 'identifiers',
    definition:
      "The primary use classification of a building (e.g., Multifamily, Office, Warehouse). Jurisdictions assign different emissions intensity factors per occupancy type, so the right classification is critical to an accurate limit.",
  },

  // Statuses
  {
    id: 'status-compliant',
    label: 'Compliant',
    category: 'statuses',
    definition:
      'Total emissions for the year are at or below the jurisdiction-issued emissions limit. No penalty is assessed.',
  },
  {
    id: 'status-at-risk',
    label: 'At Risk',
    category: 'statuses',
    definition:
      'Current data projects the building to finish the year within 10% of the limit. Action is recommended before year-end to avoid crossing into over-limit.',
  },
  {
    id: 'status-over-limit',
    label: 'Over Limit',
    category: 'statuses',
    definition:
      "Total emissions exceed the jurisdiction's limit. The building will owe a penalty equal to ($268/tCO₂e for LL97) × tons over limit unless deductions or adjustments reduce the overage.",
  },
  {
    id: 'status-incomplete',
    label: 'Incomplete',
    category: 'statuses',
    definition:
      'Not enough utility data has been entered to calculate a compliance status. Typically resolved by adding readings via manual entry, CSV upload, or Portfolio Manager sync.',
  },

  // Concepts
  {
    id: 'rec',
    label: 'REC',
    category: 'concepts',
    definition:
      'Renewable Energy Certificate. Represents one megawatt-hour of electricity generated from a renewable source. Retiring RECs can offset a portion of a building\'s reported emissions, subject to jurisdiction rules.',
  },
  {
    id: 'deduction',
    label: 'Deduction',
    category: 'concepts',
    definition:
      'A verified reduction applied against gross emissions — e.g., retired RECs, on-site solar generation, or participation in a community distributed-generation program. Net emissions (gross minus deductions) determine penalty exposure.',
  },
  {
    id: 'portfolio-manager',
    label: 'Portfolio Manager',
    category: 'concepts',
    definition:
      "EPA ENERGY STAR Portfolio Manager — the free online tool for tracking building energy and water. Compliance OS can sync monthly readings directly from a Portfolio Manager account, avoiding manual entry.",
  },
  {
    id: 'rdp',
    label: 'RDP',
    category: 'concepts',
    definition:
      "Registered Design Professional — a New York State–licensed Professional Engineer (PE) or Registered Architect (RA). LL97 requires a building's annual emissions report to be certified by an RDP, who attests under their professional license that the data and calculations are accurate before the owner files it with the Department of Buildings.",
    example: 'Compliance OS prepares the report, but a PE or RA must review and sign it as the RDP before it can be submitted.',
  },
];

const termIndex = new Map(glossaryTerms.map((term) => [term.id, term]));

export function getGlossaryTerm(id: string): GlossaryTerm | undefined {
  return termIndex.get(id);
}

export const glossaryCategoryLabels: Record<GlossaryCategory, string> = {
  regulations: 'Regulations',
  metrics: 'Metrics & Units',
  identifiers: 'Building Identifiers',
  statuses: 'Compliance Statuses',
  concepts: 'Concepts',
};

export function groupTermsByCategory(): Array<{ category: GlossaryCategory; label: string; terms: GlossaryTerm[] }> {
  const order: GlossaryCategory[] = ['regulations', 'metrics', 'identifiers', 'statuses', 'concepts'];
  return order.map((category) => ({
    category,
    label: glossaryCategoryLabels[category],
    terms: glossaryTerms.filter((t) => t.category === category),
  }));
}
