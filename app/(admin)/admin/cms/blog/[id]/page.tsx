import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { saveBlogPostAction } from "@/app/(admin)/admin/cms/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requireRole } from "@/lib/auth/session";
import { getBlogPost } from "@/lib/repositories/cms-repository";

export const metadata: Metadata = {
  title: "Edit Blog Post - CMS",
};

type EditBlogPostProps = {
  params: Promise<{ id: string }>;
};

export default async function EditCMSBlogPost({ params }: EditBlogPostProps) {
  await requireRole([UserRole.ADMIN]);

  const { id } = await params;
  const isNew = id === "new";

  let post = null;
  if (!isNew) {
    post = await getBlogPost(id);
    if (!post) {
      notFound();
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/cms/blog">← Back</Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">
          {isNew ? "Create New Blog Post" : "Edit Blog Post"}
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Post Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={saveBlogPostAction} className="space-y-6">
            {!isNew && <input type="hidden" name="id" value={post?.id} />}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="title" className="text-sm font-medium">
                  Title
                </label>
                <Input
                  id="title"
                  name="title"
                  required
                  defaultValue={post?.title || ""}
                  placeholder="e.g. 5 Tips for Math Success"
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
                  defaultValue={post?.slug || ""}
                  placeholder="e.g. 5-tips-for-math-success"
                  pattern="[a-z0-9-]+"
                  title="Only lowercase letters, numbers, and hyphens"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="content" className="text-sm font-medium">
                Content (Markdown / HTML)
              </label>
              <Textarea
                id="content"
                name="content"
                required
                className="font-mono text-sm min-h-[400px]"
                defaultValue={post?.content || ""}
                placeholder="# Introduction\n\nWrite your blog post here..."
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isPublished"
                name="isPublished"
                value="true"
                defaultChecked={post?.isPublished}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <label htmlFor="isPublished" className="text-sm font-medium">
                Publish Post (visible to public)
              </label>
            </div>

            <div className="flex justify-end gap-4">
              <Button asChild variant="outline">
                <Link href="/admin/cms/blog">Cancel</Link>
              </Button>
              <Button type="submit">{isNew ? "Create Post" : "Save Changes"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
