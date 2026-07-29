import type { Metadata } from "next";

import { getPublishedTestimonials } from "@/lib/repositories/cms-repository";

import { PageHero } from "@/components/sections/page-hero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Results & Testimonials",
  description: "Academic performance goals and parent testimonials for ULU Online School.",
};

export default async function ResultsPage() {
  const testimonials = await getPublishedTestimonials();

  return (
    <>
      <PageHero
        title="Results & Testimonials"
        description="ULU prepares students for IGCSE examinations and international university pathways."
      />
      <section className="section-shell">
        <div className="container grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Academic Performance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                ULU students work through continuous assessment, revision cycles, and exam-focused
                classroom routines designed to prepare them for IGCSE examinations and the next
                academic stage after secondary school.
              </p>
              <p>
                Families receive performance updates through class feedback, progress reporting, and
                structured review points that help track consistency across the school year.
              </p>
            </CardContent>
          </Card>

          {testimonials.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-3">
              {testimonials.map((testimonial) => (
                <Card key={testimonial.id}>
                  <CardHeader>
                    <CardTitle className="text-lg">{testimonial.studentName}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    &quot;{testimonial.quote}&quot;
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
