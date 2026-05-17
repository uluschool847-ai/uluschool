import Link from "next/link";

import { createSubjectAction, updateSubjectAction } from "@/app/(admin)/admin/subjects/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type SubjectFormProps = {
  mode: "create" | "edit";
  subject?: {
    id: string;
    slug: string;
    name: string;
    description: string;
    isActive: boolean;
    priority: number;
  };
  flashMessage?: string;
  flashError?: string;
  successRedirect: string;
  errorRedirect: string;
};

function SubjectFlash({ message, error }: { message?: string; error?: string }) {
  if (error) {
    return (
      <div
        className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        role="alert"
      >
        {error}
      </div>
    );
  }

  if (message) {
    return (
      <output className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        {message}
      </output>
    );
  }

  return null;
}

export function SubjectForm({
  mode,
  subject,
  flashMessage,
  flashError,
  successRedirect,
  errorRedirect,
}: SubjectFormProps) {
  const isNew = mode === "create";
  const formAction = isNew ? createSubjectAction : updateSubjectAction;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isNew ? "Create Subject" : "Edit Subject"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <SubjectFlash message={flashMessage} error={flashError} />

        <form
          action={formAction as unknown as (formData: FormData) => void}
          className="space-y-6"
          noValidate
        >
          <input type="hidden" name="flash" value="true" />
          <input type="hidden" name="successRedirect" value={successRedirect} />
          <input type="hidden" name="errorRedirect" value={errorRedirect} />
          {!isNew && subject ? <input type="hidden" name="id" value={subject.id} /> : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">
                Name <span aria-hidden="true">*</span>
              </Label>
              <Input id="name" name="name" required defaultValue={subject?.name ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">
                Slug <span aria-hidden="true">*</span>
              </Label>
              <Input
                id="slug"
                name="slug"
                required
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                defaultValue={subject?.slug ?? ""}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              required
              defaultValue={subject?.description ?? ""}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Input
                id="priority"
                name="priority"
                type="number"
                required
                defaultValue={subject?.priority ?? 0}
              />
            </div>
            <div className="flex items-end gap-2">
              <input
                id="isActive"
                name="isActive"
                type="checkbox"
                value="true"
                defaultChecked={subject?.isActive ?? true}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <Label htmlFor="isActive">Active</Label>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button asChild variant="outline">
              <Link href="/admin/subjects">Cancel</Link>
            </Button>
            <Button type="submit">{isNew ? "Create Subject" : "Save Changes"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
