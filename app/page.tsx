import type { Metadata } from "next";
import Link from "next/link";

import { FreeTrialCtaSection } from "@/components/sections/free-trial-cta-section";
import { HeroSection } from "@/components/sections/hero-section";
import { HowClassesWorkSection } from "@/components/sections/how-classes-work-section";
import { SubjectsLevelsSection } from "@/components/sections/subjects-levels-section";
import { TestimonialsSection } from "@/components/sections/testimonials-section";
import { TrustBarSection } from "@/components/sections/trust-bar-section";
import { WhyChooseSection } from "@/components/sections/why-choose-section";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Home",
  description:
    "ULU Online School delivers structured, interactive, and exam-focused Cambridge education to students anywhere in the world.",
};

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <TrustBarSection />
      <section className="section-shell">
        <div className="container max-w-5xl">
          <div className="prestige-surface p-6 md:p-8">
            <h2>About ULU</h2>
            <p className="mt-3 text-muted-foreground">
              ULU Online School is a fully virtual international school providing Cambridge
              curriculum education through live interactive classes, recorded lessons, structured
              assessments, and personalized academic support.
            </p>
            <p className="mt-3 text-muted-foreground">
              We combine academic excellence with technology to create a flexible and engaging
              learning environment for students worldwide.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/admissions">Apply Now</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/about">Learn More</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
      <WhyChooseSection />
      <SubjectsLevelsSection />
      <HowClassesWorkSection />
      <TestimonialsSection />
      <FreeTrialCtaSection />
    </>
  );
}
