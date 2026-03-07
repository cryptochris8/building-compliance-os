import type { ComponentType } from "react";

interface StatusConfig {
  label: string;
  color: string;
  bgColor: string;
  icon: ComponentType<{ className?: string }>;
}

interface ComplianceStatusHeroProps {
  statusConfig: StatusConfig;
  totalEmissions: number;
  emissionsLimit: number;
  penalty: number;
}

export function ComplianceStatusHero({
  statusConfig,
  totalEmissions,
  emissionsLimit,
  penalty,
}: ComplianceStatusHeroProps) {
  const StatusIcon = statusConfig.icon;

  return (
    <div className={"border-2 rounded-lg " + statusConfig.bgColor} role="status">
      <div className="p-6">
        <div className="grid gap-6 md:grid-cols-4">
          <div className="flex items-center gap-4">
            <StatusIcon className={"h-12 w-12 " + statusConfig.color} />
            <div>
              <p className="text-sm text-muted-foreground">Compliance Status</p>
              <p className={"text-2xl font-bold " + statusConfig.color}>{statusConfig.label}</p>
            </div>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Emissions</p>
            <p className="text-2xl font-bold">{totalEmissions.toFixed(2)} tCO2e</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Emissions Limit</p>
            <p className="text-2xl font-bold">{emissionsLimit.toFixed(2)} tCO2e</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Estimated Penalty</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{"$" + penalty.toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
