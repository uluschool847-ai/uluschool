import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";

import { deleteFaqItemAction } from "@/app/(admin)/admin/cms/actions";
import { ConfirmedSubmit } from "@/components/admin/ConfirmedSubmit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { listFaqItems } from "@/lib/repositories/cms-repository";

export const metadata: Metadata = {
  title: "Manage FAQs - CMS",
};

type CmsFaqListProps = {
  searchParams?: Promise<{ cmsMessage?: string }> | { cmsMessage?: string };
};

export default async function CMSFaqList({ searchParams = {} }: CmsFaqListProps) {
  await requireRole([UserRole.ADMIN]);
  const resolvedSearchParams = await searchParams;
  const faqs = await listFaqItems();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">FAQ Items</h1>
          <p className="text-muted-foreground mt-2">
            Manage frequently asked questions by category.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/cms/faq/new">Create New FAQ</Link>
        </Button>
      </div>

      {resolvedSearchParams.cmsMessage ? (
        <output className="block rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
          {resolvedSearchParams.cmsMessage}
        </output>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>All FAQs</CardTitle>
        </CardHeader>
        <CardContent>
          {faqs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No FAQ items found. Create one to get started.
            </p>
          ) : (
            <div className="rounded-md border">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Question</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Order</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {faqs.map((faq) => (
                    <tr key={faq.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3 font-medium">{faq.category}</td>
                      <td className="px-4 py-3">{faq.question}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${faq.status === "draft" ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-700"}`}
                        >
                          {faq.status === "draft" ? "Draft" : "Published"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{faq.displayOrder}</td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/admin/cms/faq/${faq.id}`}>Edit</Link>
                        </Button>
                        <ConfirmedSubmit
                          title="Delete FAQ item"
                          description={`Delete FAQ "${faq.question}" from ${faq.category}? Published FAQ content will disappear from the public FAQ surface after revalidation.`}
                          confirmLabel="Confirm delete"
                        >
                          <form action={deleteFaqItemAction} className="inline-block">
                            <input type="hidden" name="id" value={faq.id} />
                            <Button type="submit" variant="destructive" size="sm">
                              Delete
                            </Button>
                          </form>
                        </ConfirmedSubmit>
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
