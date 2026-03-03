"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const BUILDING_TABS = [
  { label: "Overview", segment: "" },
  { label: "Readings", segment: "/readings" },
  { label: "Import", segment: "/import" },
  { label: "Documents", segment: "/documents" },
  { label: "Compliance", segment: "/compliance" },
  { label: "Deductions", segment: "/deductions" },
  { label: "Reports", segment: "/reports" },
];

export default function BuildingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const buildingId = params.id as string;
  const basePath = "/buildings/" + buildingId;

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <nav className="flex border-b overflow-x-auto">
        {BUILDING_TABS.map((tab) => {
          const href = basePath + tab.segment;
          const isActive = tab.segment === ""
            ? pathname === basePath
            : pathname.startsWith(href);

          return (
            <Link
              key={tab.segment}
              href={href}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {/* Page Content */}
      {children}
    </div>
  );
}
