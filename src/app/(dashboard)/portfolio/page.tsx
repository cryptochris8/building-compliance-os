import BulkReportGenerator from "@/components/compliance/bulk-report-generator";

export default function PortfolioPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">
          Generate and download compliance reports across your portfolio.
        </p>
      </div>
      <BulkReportGenerator />
    </div>
  );
}
