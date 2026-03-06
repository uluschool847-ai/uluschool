import { academicJourney } from "@/lib/content";

import { Badge } from "@/components/ui/badge";

export function AcademicJourneySection() {
  return (
    <section className="section-shell">
      <div className="container">
        <h2>The Academic Journey</h2>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          A clear progression path from foundational learning to university readiness.
        </p>

        <div className="mt-10 hidden md:block">
          <div className="relative grid gap-4 lg:grid-cols-4">
            <div className="absolute left-0 right-0 top-7 h-px bg-secondary" aria-hidden="true" />
            {academicJourney.map((node) => (
              <article
                key={node.id}
                className="group relative rounded-xl border border-secondary bg-background p-4 transition hover:shadow-prestige"
              >
                <div className="relative z-10 mb-4 h-6 w-6 rounded-full border-4 border-background bg-primary" />
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  {node.years}
                </p>
                <h3 className="mt-1 text-2xl">{node.label}</h3>
                <div className="mt-3 max-h-0 overflow-hidden rounded-lg bg-secondary/45 p-0 text-sm text-muted-foreground opacity-0 transition-all duration-300 group-hover:max-h-48 group-hover:p-3 group-hover:opacity-100">
                  <p>{node.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {node.subjects.map((subject) => (
                      <Badge
                        key={subject}
                        variant="outline"
                        className="border-primary/30 text-primary"
                      >
                        {subject}
                      </Badge>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:hidden">
          {academicJourney.map((node) => (
            <article key={node.id} className="rounded-xl border border-secondary bg-background p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                {node.years}
              </p>
              <h3 className="mt-1 text-xl">{node.label}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{node.summary}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
