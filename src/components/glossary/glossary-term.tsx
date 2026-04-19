"use client";

import { HelpCircle } from "lucide-react";
import Link from "next/link";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getGlossaryTerm } from "@/lib/glossary/terms";
import { cn } from "@/lib/utils";

interface GlossaryTermProps {
  id: string;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Inline glossary term with a clickable info icon that opens a definition popover.
 * If `children` is provided, it is rendered as the visible term label; otherwise the
 * term's canonical label is used.
 */
export function GlossaryTerm({ id, children, className }: GlossaryTermProps) {
  const term = getGlossaryTerm(id);
  if (!term) {
    return <span className={className}>{children}</span>;
  }
  const display = children ?? term.label;

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span>{display}</span>
      <Popover>
        <PopoverTrigger
          aria-label={`About ${term.label}`}
          className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
        >
          <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80">
          <p className="text-sm font-semibold">{term.label}</p>
          <p className="mt-1 text-sm text-muted-foreground">{term.definition}</p>
          {term.example && (
            <p className="mt-2 text-xs text-muted-foreground italic">
              Example: {term.example}
            </p>
          )}
          <Link
            href={`/help/glossary#${term.id}`}
            className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
          >
            View full glossary
          </Link>
        </PopoverContent>
      </Popover>
    </span>
  );
}
