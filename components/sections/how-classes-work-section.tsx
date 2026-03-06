import { classWorkflows } from "@/lib/content";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function HowClassesWorkSection() {
  return (
    <section className="section-shell bg-secondary/30 dark:bg-card/40" id="how-it-works">
      <div className="container">
        <h2>How Online Learning Works</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {classWorkflows.map((step, index) => (
            <Card key={step.title}>
              <CardHeader>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                  Step {index + 1}
                </p>
                <CardTitle className="text-xl">{step.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
