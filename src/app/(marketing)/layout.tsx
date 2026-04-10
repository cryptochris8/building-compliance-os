import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { ThemeToggleCompact } from '@/components/layout/theme-toggle-compact';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Sticky header with frosted-glass effect */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 group">
            <ShieldCheck className="h-7 w-7 text-primary transition-transform group-hover:scale-110" />
            <span className="text-lg font-bold tracking-tight">Building Compliance OS</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/calculator"
              className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent"
            >
              Free Calculator
            </Link>
            <Link
              href="/pricing"
              className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent"
            >
              Pricing
            </Link>
            <Link
              href="/login"
              className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent"
            >
              Log In
            </Link>
            <ThemeToggleCompact />
            <Link
              href="/signup"
              className="ml-1 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-all hover:shadow-md"
            >
              Sign Up Free
            </Link>
          </nav>
        </div>
      </header>

      <main id="main-content" className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-border/60 bg-card">
        <div className="container mx-auto px-4 py-14">
          <div className="grid gap-10 md:grid-cols-4">
            {/* Brand column */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <span className="font-semibold tracking-tight">Building Compliance OS</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                LL97 compliance made simple for NYC building owners and managers.
              </p>
              <p className="text-xs text-muted-foreground/70 pt-1">
                Built for NYC. Trusted by property teams.
              </p>
            </div>

            {/* Product */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold tracking-wide uppercase text-foreground/70">Product</h4>
              <ul className="space-y-2.5 text-sm text-muted-foreground">
                <li>
                  <Link href="/calculator" className="hover:text-foreground transition-colors">
                    Free Calculator
                  </Link>
                </li>
                <li>
                  <Link href="/pricing" className="hover:text-foreground transition-colors">
                    Pricing
                  </Link>
                </li>
              </ul>
            </div>

            {/* Resources */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold tracking-wide uppercase text-foreground/70">Resources</h4>
              <ul className="space-y-2.5 text-sm text-muted-foreground">
                <li><span className="cursor-default">LL97 Guide</span></li>
                <li><span className="cursor-default">API Docs</span></li>
              </ul>
            </div>

            {/* Company */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold tracking-wide uppercase text-foreground/70">Company</h4>
              <ul className="space-y-2.5 text-sm text-muted-foreground">
                <li><span className="cursor-default">About</span></li>
                <li><span className="cursor-default">Contact</span></li>
                <li>
                  <Link href="/privacy" className="hover:text-foreground transition-colors">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-foreground transition-colors">
                    Terms of Service
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-10 border-t border-border/50 pt-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>&copy; 2026 Building Compliance OS. All rights reserved.</span>
            <span className="text-muted-foreground/60">Made in New York City</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
