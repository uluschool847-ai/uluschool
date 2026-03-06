import Link from "next/link";

import { teachers } from "@/lib/content";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function TeachersPreviewSection() {
  return (
    <section className="section-shell">
      <div className="container">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2>Our Teaching Team</h2>
          <Button asChild variant="secondary">
            <Link href="/teachers">View All Teachers</Link>
          </Button>
        </div>

        <div className="mt-8 overflow-x-auto pb-2">
          <div className="flex min-w-full gap-4">
            {teachers.map((teacher) => (
              <Card
                key={teacher.name}
                className="group min-w-[280px] flex-1 snap-start overflow-hidden"
              >
                <div className="h-56 bg-gradient-to-br from-secondary via-secondary/60 to-background p-4">
                  <div className="h-full rounded-lg border border-secondary bg-background/70" />
                </div>
                <CardContent className="relative -mt-12 border-t border-secondary bg-gradient-to-t from-primary via-primary/95 to-primary/70 pt-4 text-white">
                  <p className="font-heading text-lg">{teacher.name}</p>
                  <p className="mt-1 text-sm text-white/90">{teacher.title}</p>
                  <p className="mt-2 text-xs text-white/80">{teacher.credentials}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
