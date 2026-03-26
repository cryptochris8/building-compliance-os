import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface DataCompletenessCardProps {
  completeness: number;
  missingMonths: string[];
}

export function DataCompletenessCard({ completeness, missingMonths }: DataCompletenessCardProps) {
  return (
    <Card>
      <CardHeader><CardTitle>Data Completeness</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{completeness}% of months covered</span>
          <span className="text-sm text-muted-foreground">{12 - missingMonths.length}/12 months</span>
        </div>
        <Progress value={completeness} aria-label={"Data completeness: " + completeness + "%"} />
        {missingMonths.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="text-sm text-muted-foreground">Missing:</span>
            {missingMonths.map((m) => {
              const monthIdx = parseInt(m.split("-")[1]) - 1;
              return (
                <Badge key={m} variant="outline" className="text-amber-800 dark:text-amber-300 border-amber-400 dark:border-amber-600">
                  {MONTH_NAMES[monthIdx]} {m.split("-")[0]}
                </Badge>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
