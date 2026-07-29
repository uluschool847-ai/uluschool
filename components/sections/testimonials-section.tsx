import { Star } from "lucide-react";

import { getPublishedTestimonials } from "@/lib/repositories/cms-repository";

import { Card, CardContent } from "@/components/ui/card";

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export async function TestimonialsSection() {
  const testimonials = await getPublishedTestimonials();

  if (testimonials.length === 0) {
    return null;
  }

  return (
    <section className="section-shell bg-secondary/30 dark:bg-card/40">
      <div className="container">
        <h2>Testimonials</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {testimonials.map((testimonial) => (
            <Card key={testimonial.id}>
              <CardContent className="pt-6">
                <div
                  className="mb-4 flex items-center gap-1 text-accent"
                  aria-label="5 star rating"
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <Star key={value} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <div className="mb-4 flex items-center gap-3">
                  {testimonial.photoUrl ? (
                    <img
                      src={testimonial.photoUrl}
                      alt={testimonial.studentName}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {getInitials(testimonial.studentName)}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {testimonial.studentName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {testimonial.guardianName ?? testimonial.levelLabel}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-foreground/90">"{testimonial.quote}"</p>
                <p className="mt-4 text-sm font-semibold text-primary">{testimonial.levelLabel}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
