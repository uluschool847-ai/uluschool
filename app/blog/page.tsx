import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/sections/page-hero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPublishedPosts } from "@/lib/repositories/cms-repository";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "ULU Online School blog categories covering Cambridge exam tips, study strategies, parent guidance, and online learning success.",
};

function buildExcerpt(content: string, excerpt?: string) {
  if (excerpt?.trim()) {
    return excerpt;
  }

  return content.length > 140 ? `${content.slice(0, 140).trim()}...` : content;
}

function formatPublishedDate(date: Date | null, fallback: Date) {
  return (date ?? fallback).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function BlogPage() {
  const posts = await getPublishedPosts();

  return (
    <>
      <PageHero
        title="Blog"
        description="Insights and guidance for students and parents in Cambridge online learning."
      />
      <section className="section-shell">
        <div className="container grid gap-4 md:grid-cols-2">
          {posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No posts found.</p>
          ) : (
            posts.map((post) => (
              <Card key={post.slug}>
                <CardHeader>
                  <CardTitle>
                    <Link href={`/blog/${post.slug}`} className="hover:underline">
                      {post.title}
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>{buildExcerpt(post.content, post.excerpt)}</p>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
                    {formatPublishedDate(post.publishedAt, post.createdAt)}
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </section>
    </>
  );
}
