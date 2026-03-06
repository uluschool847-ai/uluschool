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
            ULU Online School delivers structured, interactive, and exam-focused Cambridge
            education to students anywhere in the world.
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

        <article className="prestige-surface relative overflow-hidden p-5">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/20" />
          <div className="relative rounded-lg border border-secondary bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">
              Live Class Dashboard
            </p>
            <div className="mt-4 rounded-md border border-secondary bg-secondary/35 p-4">
              <p className="text-sm font-medium text-primary">IGCSE Science - Live Session</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Interactive teaching, assignments, and continuous assessment tracking.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="h-10 rounded bg-background" />
                <div className="h-10 rounded bg-background" />
                <div className="h-10 rounded bg-background" />
              </div>
            </div>
            <div className="mt-4 h-52 rounded-md bg-gradient-to-br from-secondary to-background p-4">
              <div className="h-full rounded-md border border-secondary bg-background/75 p-4">
                <p className="text-sm text-muted-foreground">
                  Students learn through live classes, recorded lessons, downloadable materials,
                  and clear progress reporting.
                </p>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
