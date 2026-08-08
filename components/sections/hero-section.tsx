import { CirclePlay, Download } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function HeroSection() {
  return (
    <section className="section-shell pt-14 md:pt-20">
      <div className="container grid items-center gap-10 lg:grid-cols-[3fr_2fr]">
        <div className="animate-fade-up space-y-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">
            Education Without Borders
          </p>
          <h1 className="max-w-2xl">World-Class Cambridge Education - Fully Online</h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            ULU Online School delivers structured, interactive, and exam-focused Cambridge education
            to students anywhere in the world.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/admissions">Enroll Now</Link>
            </Button>
            <Button asChild variant="secondary" size="lg" className="gap-2">
              <Link href="/enrol">
                <CirclePlay className="h-4 w-4" />
                Book a Free Trial Class
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2">
              <Link href="/prospectus">
                <Download className="h-4 w-4" />
                Download Prospectus
              </Link>
            </Button>
          </div>
        </div>

        <figure className="flex min-h-[18rem] items-center justify-center sm:min-h-[24rem]">
          <div
            role="img"
            aria-label="Geometric lion illustration representing ULU Online School"
            className="w-full bg-secondary-foreground"
            style={{
              aspectRatio: "10 / 9",
              WebkitMaskImage: "url('/lion-hero-lineart.png')",
              maskImage: "url('/lion-hero-lineart.png')",
              WebkitMaskPosition: "center",
              maskPosition: "center",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
              WebkitMaskSize: "contain",
              maskSize: "contain",
            }}
          />
        </figure>
      </div>
    </section>
  );
}
