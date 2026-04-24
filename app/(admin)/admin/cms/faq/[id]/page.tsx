import { UserRole } from "@prisma/client";
import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/session";
import { getFaqItem } from "@/lib/repositories/cms-repository";
import { saveFaqItemAction } from "@/app/(admin)/admin/cms/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const metadata: Metadata = {
  title: "Edit FAQ - CMS",
};

type EditFaqProps = {
  params: Promise<{ id: string }>;
};

export default async function EditCMSFaq({ params }: EditFaqProps) {
  await requireRole([UserRole.ADMIN]);
  
  const { id } = await params;
  const isNew = id === "new";
  
  let faq = null;
  if (!isNew) {
    faq = await getFaqItem(id);
    if (!faq) {
      notFound();
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/cms/faq">← Back</Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">
          {isNew ? "Create New FAQ" : "Edit FAQ"}
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>FAQ Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={saveFaqItemAction} className="space-y-6">
            {!isNew && <input type="hidden" name="id" value={faq?.id} />}
            
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="category" className="text-sm font-medium">Category</label>
                <Input 
                  id="category" 
                  name="category" 
                  required 
                  defaultValue={faq?.category || "General"} 
                  placeholder="e.g. Payments, Classes, General" 
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="displayOrder" className="text-sm font-medium">Display Order</label>
                <Input 
                  id="displayOrder" 
                  name="displayOrder" 
                  type="number"
                  required 
                  defaultValue={faq?.displayOrder || 0} 
                  placeholder="0" 
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="question" className="text-sm font-medium">Question</label>
              <Input 
                id="question" 
                name="question" 
                required 
                defaultValue={faq?.question || ""} 
                placeholder="e.g. How do I reset my password?" 
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="answer" className="text-sm font-medium">Answer</label>
              <Textarea 
                id="answer" 
                name="answer" 
                required 
                className="min-h-[150px]" 
                defaultValue={faq?.answer || ""} 
                placeholder="Write the answer here..."
              />
            </div>

            <div className="flex justify-end gap-4">
              <Button asChild variant="outline">
                <Link href="/admin/cms/faq">Cancel</Link>
              </Button>
              <Button type="submit">
                {isNew ? "Create FAQ" : "Save Changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
