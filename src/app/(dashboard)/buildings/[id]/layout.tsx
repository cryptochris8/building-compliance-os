"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Breadcrumb } from "@/components/ui/breadcrumb";

const BUILDING_TABS = [
  { label: "Overview", segment: "" },
  { label: "Accounts", segment: "/accounts" },
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

  // Determine active tab for breadcrumb
  const activeTab = BUILDING_TABS.find((tab) =>
    tab.segment === ""
      ? pathname === basePath
      : pathname.startsWith(basePath + tab.segment)
  );

  const breadcrumbItems = [
    { label: "Buildings", href: "/buildings" },
    { label: "Building Details", href: basePath },
    ...(activeTab && activeTab.segment !== ""
      ? [{ label: activeTab.label }]
      : []),
  ];

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <Breadcrumb items={breadcrumbItems} />

      {/* Tab Navigation */}
      <nav aria-label="Building sections" className="flex border-b overflow-x-auto">
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
