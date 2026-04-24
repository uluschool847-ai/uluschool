import { Star } from "lucide-react";

import { testimonials } from "@/lib/content";

import { Card, CardContent } from "@/components/ui/card";

export function TestimonialsSection() {
  return (
    <section className="section-shell bg-secondary/30 dark:bg-card/40">
      <div className="container">
        <h2>Testimonials</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {testimonials.map((testimonial, index) => (
            <Card key={`${testimonial.label}-${index}`}>
              <CardContent className="pt-6">
                <div
                  className="mb-4 flex items-center gap-1 text-accent"
                  aria-label="5 star rating"
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <Star key={value} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <p className="text-sm text-foreground/90">"{testimonial.quote}"</p>
                <p className="mt-4 text-sm font-semibold text-primary">{testimonial.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
