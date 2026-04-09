import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ComplianceStatus } from "@/types";

/**
 * Visual config for each compliance status.
 *
 * Colours use Tailwind classes that reference the semantic CSS tokens
 * defined in globals.css (--success, --warning, --destructive, --muted).
 * This ensures both light and dark mode render correctly without
 * per-status dark: overrides scattered throughout the codebase.
 */
const STATUS_BADGES: Record<
  string,
  {
    label: string;
    /** Tailwind utility classes applied to the Badge element */
    className: string;
  }
> = {
  compliant: {
    label: "Compliant",
    // teal-green background using the --success token surface
    className:
      "border-transparent bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]",
  },
  at_risk: {
    label: "At Risk",
    // amber background using the --warning token surface
    className:
      "border-transparent bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning-border)]",
  },
  over_limit: {
    label: "Over Limit",
    // uses the existing shadcn destructive variant — already maps to --destructive
    className: "border-transparent bg-destructive/15 text-destructive border-destructive/30",
  },
  incomplete: {
    label: "Incomplete",
    // neutral muted variant
    className: "border-muted-foreground/30 text-muted-foreground bg-muted",
  },
};

export function ComplianceStatusBadge({ status }: { status: ComplianceStatus }) {
  const badge = STATUS_BADGES[status] ?? STATUS_BADGES.incomplete;
  return (
    <Badge variant="outline" className={cn("font-medium", badge.className)}>
      {badge.label}
    </Badge>
  );
}

export { STATUS_BADGES };
