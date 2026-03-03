import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

const colors = {
  primary: "#1a365d",
  secondary: "#2d3748",
  accent: "#3182ce",
  success: "#38a169",
  warning: "#d69e2e",
  danger: "#e53e3e",
  lightGray: "#f7fafc",
  mediumGray: "#e2e8f0",
  darkGray: "#4a5568",
  white: "#ffffff",
};

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 10, color: colors.secondary },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 2, borderBottomColor: colors.primary, paddingBottom: 10, marginBottom: 20 },
  headerTitle: { fontSize: 8, color: colors.darkGray },
  headerPage: { fontSize: 8, color: colors.darkGray },
  coverPage: { flex: 1, justifyContent: "center", alignItems: "center" },
  coverTitle: { fontSize: 28, fontFamily: "Helvetica-Bold", color: colors.primary, marginBottom: 10 },
  coverSubtitle: { fontSize: 16, color: colors.darkGray, marginBottom: 30 },
  coverDetail: { fontSize: 12, color: colors.secondary, marginBottom: 6 },
  sectionTitle: { fontSize: 16, fontFamily: "Helvetica-Bold", color: colors.primary, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.mediumGray, paddingBottom: 4 },
  text: { fontSize: 10, marginBottom: 4, lineHeight: 1.4 },
  bold: { fontFamily: "Helvetica-Bold" },
  table: { width: "100%", marginBottom: 16 },
  tableHeader: { flexDirection: "row", backgroundColor: colors.primary, padding: 6 },
  tableHeaderCell: { flex: 1, fontSize: 8, fontFamily: "Helvetica-Bold", color: colors.white },
  tableRow: { flexDirection: "row", padding: 6, borderBottomWidth: 0.5, borderBottomColor: colors.mediumGray },
  tableRowAlt: { flexDirection: "row", padding: 6, borderBottomWidth: 0.5, borderBottomColor: colors.mediumGray, backgroundColor: colors.lightGray },
  tableCell: { flex: 1, fontSize: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, alignSelf: "flex-start", marginBottom: 8 },
  statusText: { fontSize: 12, fontFamily: "Helvetica-Bold", color: colors.white },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 16 },
  summaryCard: { width: "48%", padding: 10, marginRight: "2%", marginBottom: 8, backgroundColor: colors.lightGray, borderRadius: 4, borderLeftWidth: 3, borderLeftColor: colors.accent },
  summaryLabel: { fontSize: 8, color: colors.darkGray, marginBottom: 2 },
  summaryValue: { fontSize: 14, fontFamily: "Helvetica-Bold", color: colors.secondary },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, textAlign: "center", fontSize: 7, color: colors.darkGray },
  signatureLine: { borderBottomWidth: 1, borderBottomColor: colors.secondary, width: 200, marginTop: 40, marginBottom: 4 },
  signatureLabel: { fontSize: 8, color: colors.darkGray },
});
export interface ReportData {
  building: {
    name: string; address: string; bbl: string | null; bin: string | null;
    occupancyType: string; grossSqft: number; jurisdictionId: string;
  };
  compliance: {
    year: number; status: string; totalEmissions: number; emissionsLimit: number;
    emissionsOverLimit: number; penalty: number; completeness: number;
    totalDeductions: number; netEmissions: number;
  };
  emissionsByFuel: Array<{
    utilityType: string; annualConsumption: number; unit: string;
    coefficient: number; emissions: number; percentOfTotal: number;
  }>;
  monthlyConsumption: Array<{
    month: string; electricity: number; naturalGas: number;
    districtSteam: number; fuelOil2: number; fuelOil4: number;
  }>;
  yearOverYear: Array<{ year: number; emissions: number; limit: number; trend: string }>;
  dataSources: Array<{
    accountName: string; utilityType: string; source: string;
    readingCount: number; confidence: string;
  }>;
  deductions: Array<{ type: string; description: string; amount: number; verified: boolean }>;
  documents: Array<{ fileName: string; documentType: string; uploadDate: string }>;
  organizationName: string;
  generatedAt: string;
}

function getStatusColor(status: string): string {
  switch (status) {
    case "compliant": return colors.success;
    case "at_risk": return colors.warning;
    case "over_limit": return colors.danger;
    default: return colors.darkGray;
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "compliant": return "COMPLIANT";
    case "at_risk": return "AT RISK";
    case "over_limit": return "OVER LIMIT";
    default: return "INCOMPLETE";
  }
}

function fmt(n: number, d = 2): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
export function ComplianceReportDocument({ data }: { data: ReportData }) {
  const statusColor = getStatusColor(data.compliance.status);
  const statusLabel = getStatusLabel(data.compliance.status);
  const surplus = data.compliance.totalEmissions - data.compliance.emissionsLimit;
  return (
    <Document>
      {/* Cover Page */}
      <Page size="LETTER" style={styles.page}>
        <View style={styles.coverPage}>
          <Text style={styles.coverTitle}>Compliance Report</Text>
          <Text style={styles.coverSubtitle}>Building Emissions Report - {data.compliance.year}</Text>
          <View style={{ marginTop: 20, alignItems: "center" }}>
            <Text style={styles.coverDetail}>{data.building.name}</Text>
            <Text style={styles.coverDetail}>{data.building.address}</Text>
            {data.building.bbl && <Text style={styles.coverDetail}>BBL: {data.building.bbl}</Text>}
            {data.building.bin && <Text style={styles.coverDetail}>BIN: {data.building.bin}</Text>}
            <Text style={styles.coverDetail}>Occupancy: {data.building.occupancyType}</Text>
            <Text style={styles.coverDetail}>Jurisdiction: {data.building.jurisdictionId}</Text>
          </View>
          <View style={{ marginTop: 30, alignItems: "center" }}>
            <Text style={styles.coverDetail}>Organization: {data.organizationName}</Text>
            <Text style={styles.coverDetail}>Generated: {data.generatedAt}</Text>
          </View>
        </View>
        <Text style={styles.footer}>Building Compliance OS - Confidential</Text>
      </Page>

      {/* Executive Summary */}
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{data.building.name}</Text>
          <Text style={styles.headerPage}>Executive Summary</Text>
        </View>
        <Text style={styles.sectionTitle}>Executive Summary</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Emissions</Text>
            <Text style={styles.summaryValue}>{fmt(data.compliance.totalEmissions)} tCO2e</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Emissions Limit</Text>
            <Text style={styles.summaryValue}>{fmt(data.compliance.emissionsLimit)} tCO2e</Text>
          </View>
          <View style={[styles.summaryCard, { borderLeftColor: surplus > 0 ? colors.danger : colors.success }]}>
            <Text style={styles.summaryLabel}>{surplus > 0 ? "Over Limit" : "Under Limit"}</Text>
            <Text style={styles.summaryValue}>{surplus > 0 ? "+" : ""}{fmt(surplus)} tCO2e</Text>
          </View>
          <View style={[styles.summaryCard, { borderLeftColor: data.compliance.penalty > 0 ? colors.danger : colors.success }]}>
            <Text style={styles.summaryLabel}>Estimated Penalty</Text>
            <Text style={styles.summaryValue}>${fmt(data.compliance.penalty)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Data Completeness</Text>
            <Text style={styles.summaryValue}>{data.compliance.completeness}%</Text>
          </View>
          {data.compliance.totalDeductions > 0 && (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Net Emissions</Text>
              <Text style={styles.summaryValue}>{fmt(data.compliance.netEmissions)} tCO2e</Text>
            </View>
          )}
        </View>
        <Text style={styles.footer}>Building Compliance OS - Confidential</Text>
      </Page>
      {/* Emissions Detail */}
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{data.building.name}</Text>
          <Text style={styles.headerPage}>Emissions Detail</Text>
        </View>
        <Text style={styles.sectionTitle}>Emissions by Fuel Type</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Utility Type</Text>
            <Text style={styles.tableHeaderCell}>Consumption</Text>
            <Text style={styles.tableHeaderCell}>Unit</Text>
            <Text style={styles.tableHeaderCell}>Emissions (tCO2e)</Text>
            <Text style={styles.tableHeaderCell}>% of Total</Text>
          </View>
          {data.emissionsByFuel.map((row, i) => (
            <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
              <Text style={[styles.tableCell, { flex: 2 }]}>{row.utilityType}</Text>
              <Text style={styles.tableCell}>{fmt(row.annualConsumption, 0)}</Text>
              <Text style={styles.tableCell}>{row.unit}</Text>
              <Text style={styles.tableCell}>{fmt(row.emissions, 3)}</Text>
              <Text style={styles.tableCell}>{fmt(row.percentOfTotal, 1)}%</Text>
            </View>
          ))}
        </View>
        <Text style={styles.sectionTitle}>Monthly Consumption</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Month</Text>
            <Text style={styles.tableHeaderCell}>Elec (kWh)</Text>
            <Text style={styles.tableHeaderCell}>Gas (therms)</Text>
            <Text style={styles.tableHeaderCell}>Steam (Mlb)</Text>
          </View>
          {data.monthlyConsumption.map((row, i) => (
            <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
              <Text style={[styles.tableCell, { flex: 2 }]}>{row.month}</Text>
              <Text style={styles.tableCell}>{row.electricity > 0 ? fmt(row.electricity, 0) : "-"}</Text>
              <Text style={styles.tableCell}>{row.naturalGas > 0 ? fmt(row.naturalGas, 0) : "-"}</Text>
              <Text style={styles.tableCell}>{row.districtSteam > 0 ? fmt(row.districtSteam, 0) : "-"}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.footer}>Building Compliance OS - Confidential</Text>
      </Page>

      {/* Data Sources and Deductions */}
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{data.building.name}</Text>
          <Text style={styles.headerPage}>Data Sources</Text>
        </View>
        {data.yearOverYear.length > 1 && (
          <View style={{ marginBottom: 20 }}>
            <Text style={styles.sectionTitle}>Year-over-Year</Text>
            {data.yearOverYear.map((row, i) => (
              <Text key={i} style={styles.text}>{row.year}: {fmt(row.emissions)} tCO2e (limit: {fmt(row.limit)}) {row.trend}</Text>
            ))}
          </View>
        )}
        <Text style={styles.sectionTitle}>Data Sources</Text>
        {data.dataSources.map((row, i) => (
          <Text key={i} style={styles.text}>{row.accountName} - {row.utilityType} ({row.source}, {row.readingCount} readings, {row.confidence})</Text>
        ))}
        {data.deductions.length > 0 && (
          <View style={{ marginTop: 16 }}>
            <Text style={styles.sectionTitle}>Deductions Applied</Text>
            {data.deductions.map((row, i) => (
              <Text key={i} style={styles.text}>{row.type}: {row.description} ({fmt(row.amount, 3)} tCO2e) {row.verified ? "[Verified]" : "[Pending]"}</Text>
            ))}
          </View>
        )}
        {data.documents.length > 0 && (
          <View style={{ marginTop: 16 }}>
            <Text style={styles.sectionTitle}>Evidence Index</Text>
            {data.documents.map((row, i) => (
              <Text key={i} style={styles.text}>{row.fileName} ({row.documentType}) - {row.uploadDate}</Text>
            ))}
          </View>
        )}
        <Text style={styles.footer}>Building Compliance OS - Confidential</Text>
      </Page>

      {/* Certification */}
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{data.building.name}</Text>
          <Text style={styles.headerPage}>Certification</Text>
        </View>
        <Text style={styles.sectionTitle}>Preparer Certification</Text>
        <Text style={styles.text}>I hereby certify that the information in this report is accurate and complete to the best of my knowledge for reporting year {data.compliance.year}.</Text>
        <View style={{ marginTop: 40 }}><View style={styles.signatureLine} /><Text style={styles.signatureLabel}>Signature / Date</Text></View>
        <View style={{ marginTop: 20 }}><View style={styles.signatureLine} /><Text style={styles.signatureLabel}>Printed Name / RDP License</Text></View>
        <Text style={styles.footer}>Building Compliance OS - Confidential</Text>
      </Page>
    </Document>
  );
}
