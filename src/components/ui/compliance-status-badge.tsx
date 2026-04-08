import { Badge } from "@/components/ui/badge";
import type { ComplianceStatus } from "@/types";

const STATUS_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  compliant: { label: "Compliant", variant: "default" },
  at_risk: { label: "At Risk", variant: "secondary" },
  over_limit: { label: "Over Limit", variant: "destructive" },
  incomplete: { label: "Incomplete", variant: "outline" },
};

export function ComplianceStatusBadge({ status }: { status: ComplianceStatus }) {
  const badge = STATUS_BADGES[status] || STATUS_BADGES.incomplete;
  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}

export { STATUS_BADGES };
