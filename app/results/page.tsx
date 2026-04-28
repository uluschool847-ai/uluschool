import type { Metadata } from "next";

import { testimonials } from "@/lib/content";

import { PageHero } from "@/components/sections/page-hero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Results & Testimonials",
  description: "Academic performance goals and parent testimonials for ULU Online School.",
};

export default function ResultsPage() {
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
                ULU students are prepared for IGCSE examinations and international university
                pathways.
              </p>
              <p>You will add actual results once available.</p>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            {testimonials.map((testimonial) => (
              <Card key={`${testimonial.label}-${testimonial.quote}`}>
                <CardHeader>
                  <CardTitle className="text-lg">{testimonial.label}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  &quot;{testimonial.quote}&quot;
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
