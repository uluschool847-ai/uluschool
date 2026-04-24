import { UserRole } from "@prisma/client";
import { Metadata } from "next";
import Link from "next/link";

import { requireRole } from "@/lib/auth/session";
import { listPages } from "@/lib/repositories/cms-repository";
import { deletePageAction } from "@/app/(admin)/admin/cms/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Manage Pages - CMS",
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

export default async function CMSPagesList() {
  await requireRole([UserRole.ADMIN]);
  const pages = await listPages();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pages</h1>
          <p className="mt-2 text-muted-foreground">
            Manage website pages and structured content. Published pages are public at{" "}
            <code>/pages/[slug]</code> and are listed on <code>/pages</code>.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/cms/pages/new">Create New Page</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Pages</CardTitle>
        </CardHeader>
        <CardContent>
          {pages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pages found. Create one to get started.</p>
          ) : (
            <div className="rounded-md border">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">Public URL</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Last Updated</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pages.map((page) => (
                    <tr key={page.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3 font-medium">{page.title}</td>
                      <td className="px-4 py-3 text-muted-foreground">/pages/{page.slug}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${page.isPublished ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-800"}`}>
                          {page.isPublished ? "Published" : "Draft"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(page.updatedAt)}</td>
                      <td className="px-4 py-3 text-right space-x-2">
                        {page.isPublished ? (
                          <Button asChild variant="secondary" size="sm">
                            <Link href={`/pages/${page.slug}`} target="_blank" rel="noreferrer">
                              View Live
                            </Link>
                          </Button>
                        ) : null}
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/admin/cms/pages/${page.id}`}>Edit</Link>
                        </Button>
                        <form action={deletePageAction} className="inline-block">
                          <input type="hidden" name="id" value={page.id} />
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
