import type { Metadata } from "next";

import { getActiveTeachers } from "@/lib/repositories/cms-repository";

import { FreeTrialCtaSection } from "@/components/sections/free-trial-cta-section";
import { PageHero } from "@/components/sections/page-hero";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Teachers",
  description: "Meet ULU Online School's Cambridge-experienced teachers and subject specialists.",
};

export default async function TeachersPage() {
  const teachers = await getActiveTeachers();

  return (
    <>
      <PageHero
        title="Our Teaching Team"
        description="ULU teachers are Cambridge-experienced educators, subject specialists, trained in online instruction, and committed to student success."
      />
      <section className="section-shell">
        <div className="container">
          <div className="mb-8 rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            Each teacher profile includes qualification, teaching experience, and subjects taught.
          </div>
          {teachers.length === 0 ? (
            <Card className="mx-auto max-w-2xl border-dashed">
              <CardContent className="py-12 text-center text-muted-foreground">
                Our teaching team is being updated.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
              {teachers.map((teacher) => (
                <Card key={teacher.id} className="w-full overflow-hidden">
                  {teacher.photoUrl ? (
                    <img
                      src={teacher.photoUrl}
                      alt={teacher.fullName}
                      className="aspect-[4/5] w-full object-cover object-center"
                    />
                  ) : null}
                  <CardHeader>
                    {!teacher.photoUrl ? (
                      <div
                        role="img"
                        aria-label={`Placeholder avatar for ${teacher.fullName}`}
                        className="avatar flex aspect-square w-20 items-center justify-center rounded-full bg-muted text-3xl font-semibold text-muted-foreground"
                      >
                        {teacher.fullName.charAt(0).toUpperCase()}
                      </div>
                    ) : null}
                    <CardTitle className="text-xl">{teacher.fullName}</CardTitle>
                    <p className="text-sm font-medium text-primary">{teacher.title}</p>
                    {teacher.subjects.length > 0 ? (
                      <fieldset className="flex flex-wrap gap-2 pt-2">
                        <legend className="sr-only">Teacher subjects</legend>
                        {teacher.subjects.map((subject) => (
                          <Badge key={subject.id} variant="secondary">
                            {subject.name}
                          </Badge>
                        ))}
                      </fieldset>
                    ) : null}
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>{teacher.bio}</p>
                    <p>Mode: Live interactive online instruction</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>
      <FreeTrialCtaSection />
    </>
  );
}
