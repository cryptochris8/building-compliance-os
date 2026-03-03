import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function PortfolioPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Reports</h2>
        <p className="text-muted-foreground">
          Generate and download compliance reports.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Available Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Reports will be available once building data has been entered.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
