import type { Metadata } from "next";

import { levels } from "@/lib/content";

import { PageHero } from "@/components/sections/page-hero";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Subjects",
  description:
    "Browse subjects offered at ULU Online School across Primary, Lower Secondary, and IGCSE.",
};

export default function SubjectsPage() {
  return (
    <>
      <PageHero
        title="Subjects We Teach"
        description="Cambridge-aligned subject offerings across Primary, Lower Secondary, and IGCSE levels."
      />
      <section className="py-16">
        <div className="container grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {levels.map((level) => (
            <Card key={level.key}>
              <CardHeader>
                <CardTitle className="text-lg">{level.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {level.subjects.map((subject) => (
                    <Badge key={subject} variant="secondary">
                      {subject}
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
