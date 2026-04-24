import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  CmsPageContentRenderer,
  getCmsContentSummary,
} from "@/components/cms/cms-page-content-renderer";
import { PageHero } from "@/components/sections/page-hero";
import { Card, CardContent } from "@/components/ui/card";
import { getPublishedPageBySlug } from "@/lib/repositories/cms-repository";

export const dynamic = "force-dynamic";

type CmsPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: CmsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublishedPageBySlug(slug);

  if (!page) {
    return {
      title: "Page Not Found",
      robots: { index: false, follow: false },
    };
  }

  const summary = getCmsContentSummary(page.content);

  return {
    title: page.title,
    description: summary || `Read ${page.title} on ULU Online School.`,
    alternates: {
      canonical: `/pages/${page.slug}`,
    },
  };
}

export default async function PublicCmsPage({ params }: CmsPageProps) {
  const { slug } = await params;
  const page = await getPublishedPageBySlug(slug);

  if (!page) {
    notFound();
  }

  const summary = getCmsContentSummary(page.content) || "Published content from the ULU CMS.";

  return (
    <>
      <PageHero title={page.title} description={summary} />
      <section className="section-shell">
        <div className="container max-w-4xl">
          <Card>
            <CardContent className="space-y-5 py-8">
              <CmsPageContentRenderer content={page.content} />
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  );
}
