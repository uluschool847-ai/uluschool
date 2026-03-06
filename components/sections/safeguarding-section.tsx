import { Lock, ShieldCheck } from "lucide-react";

import { safeguardingPoints } from "@/lib/content";

export function SafeguardingSection() {
  return (
    <section
      className="section-shell bg-[#F0F4F8] dark:bg-[#0f2a5f]/35"
      aria-labelledby="safeguarding-title"
    >
      <div className="container max-w-5xl">
        <div className="prestige-surface p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 id="safeguarding-title">Safe Online Learning Environment</h2>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary dark:bg-card">
              <ShieldCheck className="h-4 w-4" />
              Secure Digital Delivery
            </span>
          </div>
          <p className="mt-3 text-muted-foreground">
            ULU uses secure student accounts, controlled class access, and recorded lessons to
            support quality teaching and parent visibility.
          </p>
          <ul className="mt-6 grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
            {safeguardingPoints.map((point) => (
              <li key={point} className="flex items-start gap-2 rounded-lg bg-background p-3">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
