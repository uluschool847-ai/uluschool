import Link from "next/link";

import { Button } from "@/components/ui/button";

export function FreeTrialCtaSection() {
  return (
    <section className="section-shell">
      <div className="container">
        <article className="rounded-2xl bg-primary px-6 py-10 text-primary-foreground md:px-10 md:py-14">
          <h2 className="text-white">Start Your Child's Global Education Journey Today</h2>
          <p className="mt-4 max-w-2xl text-white/85">
            Apply now to begin admissions, or book a free trial class to experience ULU Online School.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              asChild
              variant="secondary"
              className="border-primary-foreground/40 bg-primary-foreground text-primary hover:bg-primary-foreground/90 hover:text-primary"
            >
              <Link href="/admissions">Apply Now</Link>
            </Button>
            <Button
              asChild
              variant="secondary"
              className="border-primary-foreground/40 bg-primary-foreground text-primary hover:bg-primary-foreground/90 hover:text-primary"
            >
              <Link href="/enrol">Book Free Trial Class</Link>
            </Button>
          </div>
        </article>
      </div>
    </section>
  );
}
