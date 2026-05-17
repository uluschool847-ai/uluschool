import type { Metadata } from "next";

import { PageHero } from "@/components/sections/page-hero";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCatalogueData } from "@/lib/repositories/catalogue-repository";

export const metadata: Metadata = {
  title: "Subjects",
  description:
    "Browse subjects offered at ULU Online School across Primary, Lower Secondary, and IGCSE.",
};

export default async function SubjectsPage() {
  const { subjects, levels } = await getCatalogueData();

  return (
    <>
      <PageHero
        title="Subjects We Teach"
        description="Cambridge-aligned subject offerings across Primary, Lower Secondary, and IGCSE levels."
      />
      <section className="py-16">
        <div className="container grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {levels.map((level) => (
            <Card key={level.id}>
              <CardHeader>
                <CardTitle className="text-lg">{level.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {subjects.map((subject) => (
                    <Badge key={`${level.id}-${subject.id}`} variant="secondary">
                      {subject.name}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}
