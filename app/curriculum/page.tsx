import type { Metadata } from "next";

import { PageHero } from "@/components/sections/page-hero";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCatalogueData } from "@/lib/repositories/catalogue-repository";
import { constructMetadata, generateStructuredData } from "@/lib/seo";

export const metadata: Metadata = constructMetadata({
  title: "Curriculum",
  description:
    "Explore ULU's Cambridge curriculum pathways across Primary, Lower Secondary, and IGCSE.",
});

export default async function CurriculumPage() {
  const jsonLd = generateStructuredData("Course", {
    name: "Cambridge Curriculum",
    description:
      "Explore ULU's Cambridge curriculum pathways across Primary, Lower Secondary, and IGCSE.",
  });
  const { subjects, levels } = await getCatalogueData();
  const termDates = [
    {
      term: "Term 1",
      duration: "September \u2013 December (12 weeks)",
      activities: "Learning + Midterm test + End of term exams",
    },
    {
      term: "Term 2",
      duration: "January \u2013 March (11 weeks)",
      activities: "Learning + Projects + End of term exams",
    },
    {
      term: "Term 3",
      duration: "April \u2013 June (11 weeks)",
      activities: "Learning + Final assessments",
    },
  ];

  return (
    <>
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      <PageHero
        title="Cambridge Curriculum"
        description="ULU follows the curriculum developed by Cambridge Assessment International Education."
      />
      <section className="section-shell">
        <div className="container grid gap-5 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Academic Calendar</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                Three academic terms per year, organized to support comprehensive learning and
                assessment:
              </p>
              <div className="grid gap-4 md:grid-cols-3">
                {termDates.map((item) => (
                  <div
                    key={item.term}
                    className="rounded-md border border-secondary p-4 flex flex-col gap-2"
                  >
                    <h4 className="font-semibold text-foreground">{item.term}</h4>
                    <p className="text-sm font-medium text-primary">{item.duration}</p>
                    <p className="text-sm text-muted-foreground">{item.activities}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-md bg-secondary/50 p-4 border border-secondary">
                <h4 className="font-semibold text-foreground mb-2">July \u2013 August:</h4>
                <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                  <li>Holiday</li>
                  <li>
                    <strong>Optional</strong> revision classes or holiday programs
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="container grid gap-5">
          {levels.map((level) => (
            <Card key={level.id}>
              <CardHeader>
                <CardTitle>{level.name}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5 lg:grid-cols-3">
                <div>
                  <p className="text-sm font-medium text-primary">Subjects</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {subjects.map((subject) => (
                      <Badge
                        key={`${level.id}-${subject.id}`}
                        variant="outline"
                        className="border-primary/20 text-primary"
                      >
                        {subject.name}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-primary">Focus</p>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Cambridge-aligned teaching with structured subject support and steady academic
                    progression.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-primary">Assessment</p>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    <li>Weekly quizzes</li>
                    <li>Term assessments</li>
                    <li>Progress reporting</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}
