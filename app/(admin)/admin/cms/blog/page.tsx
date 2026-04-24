import { UserRole } from "@prisma/client";
import { Metadata } from "next";
import Link from "next/link";

import { requireRole } from "@/lib/auth/session";
import { listBlogPosts } from "@/lib/repositories/cms-repository";
import { deleteBlogPostAction } from "@/app/(admin)/admin/cms/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Manage Blog - CMS",
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

export default async function CMSBlogList() {
  await requireRole([UserRole.ADMIN]);
  const posts = await listBlogPosts();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Blog Posts</h1>
          <p className="text-muted-foreground mt-2">Manage marketing articles and news updates.</p>
        </div>
        <Button asChild>
          <Link href="/admin/cms/blog/new">Create New Post</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Posts</CardTitle>
        </CardHeader>
        <CardContent>
          {posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No blog posts found. Create one to get started.</p>
          ) : (
            <div className="rounded-md border">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">Slug</th>
                    <th className="px-4 py-3 font-medium">Author</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Created At</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {posts.map((post) => (
                    <tr key={post.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3 font-medium">{post.title}</td>
                      <td className="px-4 py-3 text-muted-foreground">/{post.slug}</td>
                      <td className="px-4 py-3">{post.author.fullName}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${post.isPublished ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-800"}`}>
                          {post.isPublished ? "Published" : "Draft"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(post.createdAt)}</td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/admin/cms/blog/${post.id}`}>Edit</Link>
                        </Button>
                        <form action={deleteBlogPostAction} className="inline-block">
                          <input type="hidden" name="id" value={post.id} />
                          <Button type="submit" variant="destructive" size="sm">
                            Delete
                          </Button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
