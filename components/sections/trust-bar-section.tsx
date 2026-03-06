import { trustLogos } from "@/lib/content";

export function TrustBarSection() {
  return (
    <section className="border-y border-secondary bg-secondary/35 py-6">
      <div className="container">
        <div className="grid gap-3 text-center text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
          {trustLogos.map((logo) => (
            <p key={logo} className="rounded-md bg-background/70 px-3 py-2 grayscale">
              {logo}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
