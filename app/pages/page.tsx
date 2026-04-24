import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/sections/page-hero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listPublishedPages } from "@/lib/repositories/cms-repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Published Pages",
  description: "Published custom pages managed via the admin CMS.",
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

export default async function PublicPagesIndex() {
  const pages = await listPublishedPages();

  return (
    <>
      <PageHero
        title="Published Pages"
        description="Custom website pages published through the CMS."
      />
      <section className="section-shell">
        <div className="container max-w-5xl">
          {pages.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">
                No published CMS pages are available yet.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {pages.map((page) => (
                <Card key={page.id}>
                  <CardHeader>
                    <CardTitle>{page.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      URL: <code>/pages/{page.slug}</code>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Updated: {formatDate(page.updatedAt)}
                    </p>
                    <Button asChild size="sm">
                      <Link href={`/pages/${page.slug}`}>Open Page</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
