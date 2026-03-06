import { levels } from "@/lib/content";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function CurriculumOverviewSection() {
  return (
    <section className="bg-slate-50 py-16 dark:bg-slate-900/40">
      <div className="container">
        <h2 className="text-3xl font-bold tracking-tight">Cambridge Curriculum Overview</h2>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          We support students through every stage, from foundational skill-building to rigorous exam
          preparation.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {levels.map((level) => (
            <Card key={level.key}>
              <CardHeader>
                <CardTitle className="text-lg">{level.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{level.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
