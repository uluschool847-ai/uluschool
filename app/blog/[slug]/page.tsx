import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPostBySlug } from "@/lib/repositories/cms-repository";

type BlogDetailPageProps = {
  params: Promise<{ slug: string }> | { slug: string };
};

function formatPublishedDate(date: Date | null, fallback: Date) {
  return (date ?? fallback).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export async function generateMetadata({ params }: BlogDetailPageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const post = await getPostBySlug(resolvedParams.slug);

  if (!post) {
    return {
      title: "Post Not Found",
      description: "The requested blog post could not be found.",
    };
  }

  return {
    title: post.title,
    description: post.content.slice(0, 160),
  };
}

export default async function BlogDetailPage({ params }: BlogDetailPageProps) {
  const resolvedParams = await params;
  const post = await getPostBySlug(resolvedParams.slug);

  if (!post) {
    notFound();
  }

  return (
    <article className="section-shell">
      <div className="container max-w-3xl space-y-6">
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {formatPublishedDate(post.publishedAt, post.createdAt)}
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">{post.title}</h1>
        </header>

        <div className="prose prose-slate max-w-none whitespace-pre-wrap text-foreground">
          {post.content}
        </div>
      </div>
    </article>
  );
}
