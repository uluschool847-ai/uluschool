import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { savePageAction } from "@/app/(admin)/admin/cms/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requireRole } from "@/lib/auth/session";
import { getPage } from "@/lib/repositories/cms-repository";

export const metadata: Metadata = {
  title: "Edit Page - CMS",
};

type EditPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function EditCMSPage({ params, searchParams }: EditPageProps) {
  await requireRole([UserRole.ADMIN]);

  const { id } = await params;
  const isNew = id === "new";
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const errorCode = resolvedSearchParams?.error;
  const invalidJsonError = errorCode === "invalid-json";
  const invalidSlugError = errorCode === "invalid-slug";
  const duplicateSlugError = errorCode === "slug-taken";

  let page = null;
  if (!isNew) {
    page = await getPage(id);
    if (!page) {
      notFound();
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/cms/pages">← Back</Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">
          {isNew ? "Create New Page" : "Edit Page"}
        </h1>
        {!isNew && page?.isPublished ? (
          <Button asChild size="sm" variant="secondary">
            <Link href={`/pages/${page.slug}`} target="_blank" rel="noreferrer">
              View Live Page
            </Link>
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Page Details</CardTitle>
        </CardHeader>
        <CardContent>
          {invalidJsonError ? (
            <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              Invalid JSON content. Please fix the JSON format and submit again.
            </p>
          ) : null}
          {invalidSlugError ? (
            <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              Invalid slug. Use only lowercase letters, numbers, and hyphens.
            </p>
          ) : null}
          {duplicateSlugError ? (
            <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              This slug is already in use. Choose a different slug.
            </p>
          ) : null}
          <form action={savePageAction} className="space-y-6">
            {!isNew && <input type="hidden" name="id" value={page?.id} />}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="title" className="text-sm font-medium">
                  Title
                </label>
                <Input
                  id="title"
                  name="title"
                  required
                  defaultValue={page?.title || ""}
                  placeholder="e.g. Pricing Plans"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="slug" className="text-sm font-medium">
                  Slug (URL)
                </label>
                <Input
                  id="slug"
                  name="slug"
                  required
                  defaultValue={page?.slug || ""}
                  placeholder="e.g. pricing"
                  pattern="[a-z0-9-]+"
                  title="Only lowercase letters, numbers, and hyphens"
                />
                <p className="text-xs text-muted-foreground">
                  Public URL pattern: <code>/pages/[slug]</code>. CMS pages are listed on{" "}
                  <code>/pages</code> and are not auto-added to the main header menu.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="content" className="text-sm font-medium">
                Structured Content (JSON)
              </label>
              <p className="text-xs text-muted-foreground">
                Define the content blocks as JSON. The frontend will render them accordingly.
              </p>
              <Textarea
                id="content"
                name="content"
                required
                className="font-mono text-sm min-h-[300px]"
                defaultValue={page ? JSON.stringify(page.content, null, 2) : '{\n  "blocks": []\n}'}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isPublished"
                name="isPublished"
                value="true"
                defaultChecked={page?.isPublished}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <label htmlFor="isPublished" className="text-sm font-medium">
                Publish Page (visible to public)
              </label>
            </div>

            <div className="flex justify-end gap-4">
              <Button asChild variant="outline">
                <Link href="/admin/cms/pages">Cancel</Link>
              </Button>
              <Button type="submit">{isNew ? "Create Page" : "Save Changes"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
