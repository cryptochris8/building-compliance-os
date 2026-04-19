import { groupTermsByCategory } from "@/lib/glossary/terms";

export const metadata = {
  title: "Glossary | Compliance OS",
  description: "Definitions for building compliance terms used across Compliance OS.",
};

export default function GlossaryPage() {
  const groups = groupTermsByCategory();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Glossary</h1>
        <p className="text-muted-foreground">
          Quick reference for the regulations, metrics, and identifiers used throughout Compliance OS.
        </p>
      </header>

      {groups.map((group) => (
        group.terms.length === 0 ? null : (
          <section key={group.category} aria-labelledby={`section-${group.category}`} className="space-y-4">
            <h2 id={`section-${group.category}`} className="text-xl font-semibold">
              {group.label}
            </h2>
            <dl className="space-y-4">
              {group.terms.map((term) => (
                <div key={term.id} id={term.id} className="rounded-lg border p-4 scroll-mt-20">
                  <dt className="font-medium">{term.label}</dt>
                  <dd className="mt-1 text-sm text-muted-foreground">{term.definition}</dd>
                  {term.example && (
                    <dd className="mt-2 text-xs text-muted-foreground italic">Example: {term.example}</dd>
                  )}
                </div>
              ))}
            </dl>
          </section>
        )
      ))}
    </div>
  );
}
