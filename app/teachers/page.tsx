import type { Metadata } from "next";

import { teachers } from "@/lib/content";

import { FreeTrialCtaSection } from "@/components/sections/free-trial-cta-section";
import { PageHero } from "@/components/sections/page-hero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Teachers",
  description: "Meet ULU Online School's Cambridge-experienced teachers and subject specialists.",
};

export default function TeachersPage() {
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
          <div className="flex flex-wrap justify-center gap-8">
            {teachers.map((teacher) => (
              <Card key={teacher.name} className="w-full max-w-[300px] overflow-hidden">
                {/* @ts-ignore */}
                {teacher.image ? (
                  <img
                    src={teacher.image}
                    alt={teacher.name}
                    className="aspect-[4/5] w-full object-cover object-center"
                  />
                ) : null}
                <CardHeader>
                  <CardTitle className="text-xl">{teacher.name}</CardTitle>
                  <p className="text-sm font-medium text-primary">{teacher.title}</p>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>Qualification & Experience: {teacher.credentials}</p>
                  <p>Subjects Taught: {teacher.focus}</p>
                  <p>Mode: Live interactive online instruction</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
      <FreeTrialCtaSection />
    </>
  );
}
