type PageHeroProps = {
  title: string;
  description: string;
};

export function PageHero({ title, description }: PageHeroProps) {
  return (
    <section className="border-b border-secondary bg-gradient-to-r from-secondary/75 via-white to-secondary/40 py-16 dark:from-card dark:via-background dark:to-card/60">
      <div className="container max-w-5xl">
        <h1>{title}</h1>
        <p className="mt-4 max-w-3xl text-muted-foreground">{description}</p>
      </div>
    </section>
  );
}
