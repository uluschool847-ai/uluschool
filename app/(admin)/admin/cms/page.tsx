import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Content Management System (CMS)",
};

export default async function CMSDashboardPage() {
  await requireRole([UserRole.ADMIN]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Content Management</h1>
        <p className="text-muted-foreground mt-2">
          Manage website pages, blog posts, and frequently asked questions.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Pages</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Manage custom CMS pages. Published pages are available at <code>/pages/[slug]</code>.
            </p>
            <Button asChild className="w-full">
              <Link href="/admin/cms/pages">Manage Pages</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Blog Posts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Write, edit, and publish articles for SEO and marketing.
            </p>
            <Button asChild className="w-full">
              <Link href="/admin/cms/blog">Manage Blog</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>FAQ Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Update frequently asked questions grouped by categories.
            </p>
            <Button asChild className="w-full">
              <Link href="/admin/cms/faq">Manage FAQs</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
