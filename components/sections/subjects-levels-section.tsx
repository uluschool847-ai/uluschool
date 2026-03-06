import { levels } from "@/lib/content";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SubjectsLevelsSection() {
  return (
    <section className="section-shell bg-secondary/25 dark:bg-card/30">
      <div className="container">
        <h2>Our Programmes</h2>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Primary, Lower Secondary, and IGCSE pathways aligned with Cambridge standards.
        </p>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {levels.map((level) => (
            <Card key={level.key}>
              <CardHeader>
                <CardTitle className="text-xl">{level.label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2" aria-label={`${level.label} subjects`}>
                  {level.subjects.map((subject) => (
                    <Badge
                      key={subject}
                      variant="outline"
                      className="border-primary/20 text-primary"
                    >
                      {subject}
                    </Badge>
                  ))}
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {level.formats.map((format) => (
                    <li key={format} className="rounded-md border border-secondary px-3 py-2">
                      {format}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
