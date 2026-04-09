import React from "react";
import Link from "next/link";
import { ShieldCheck, User } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { LogoutButton } from "@/components/layout/logout-button";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";

function SidebarContent({ userEmail }: { userEmail: string | null }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <ShieldCheck className="h-8 w-8 text-primary" aria-hidden="true" />
          <div>
            <h1 className="text-lg font-bold leading-none">Compliance OS</h1>
            <p className="text-xs text-muted-foreground">Building Performance</p>
          </div>
        </Link>
      </div>
      <Separator />
      <SidebarNav />
      <Separator />
      <div className="p-4 space-y-3">
        {userEmail && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
            <User className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
            <span className="text-xs text-muted-foreground truncate" title={userEmail}>
              {userEmail}
            </span>
          </div>
        )}
        <ThemeToggle />
        <LogoutButton />
        <p className="text-xs text-muted-foreground">
          Building Compliance OS v0.6.0
        </p>
      </div>
    </div>
  );
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fetch user email server-side — no client-side waterfall
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userEmail = user?.email ?? null;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 border-r bg-card lg:block" aria-label="Primary navigation">
        <SidebarContent userEmail={userEmail} />
      </aside>

      {/* Mobile sidebar */}
      <div className="lg:hidden">
        <MobileSidebar>
          <SidebarContent userEmail={userEmail} />
        </MobileSidebar>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header is rendered inside MobileSidebar */}
        <main id="main-content" className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  );
}
