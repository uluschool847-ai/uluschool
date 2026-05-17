import Link from "next/link";

import { createStudentAction, updateStudentAction } from "@/app/(admin)/admin/students/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type StudentFormProps = {
  mode: "create" | "edit";
  student?: {
    id: string;
    fullName: string;
    email: string;
    phoneWhatsapp?: string | null;
    isActive?: boolean;
  };
  flashMessage?: string;
  flashError?: string;
  successRedirect: string;
  errorRedirect: string;
};

function StudentFlash({ message, error }: { message?: string; error?: string }) {
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

export function StudentForm({
  mode,
  student,
  flashMessage,
  flashError,
  successRedirect,
  errorRedirect,
}: StudentFormProps) {
  const isNew = mode === "create";
  const formAction = isNew ? createStudentAction : updateStudentAction;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isNew ? "Create Student" : "Edit Student"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <StudentFlash message={flashMessage} error={flashError} />

        <form
          action={formAction as unknown as (formData: FormData) => void}
          className="space-y-6"
          noValidate
        >
          <input type="hidden" name="flash" value="true" />
          <input type="hidden" name="successRedirect" value={successRedirect} />
          <input type="hidden" name="errorRedirect" value={errorRedirect} />
          {!isNew && student ? <input type="hidden" name="id" value={student.id} /> : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fullName">
                Full name <span aria-hidden="true">*</span>
              </Label>
              <Input
                id="fullName"
                name="fullName"
                required
                aria-required="true"
                defaultValue={student?.fullName ?? ""}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">
                Email <span aria-hidden="true">*</span>
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                aria-required="true"
                defaultValue={student?.email ?? ""}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phoneWhatsapp">Phone / WhatsApp</Label>
            <Input
              id="phoneWhatsapp"
              name="phoneWhatsapp"
              type="tel"
              defaultValue={student?.phoneWhatsapp ?? ""}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Student role is fixed by this form and cannot be changed here.
          </p>

          <div className="flex justify-end gap-3">
            <Button asChild variant="outline">
              <Link href="/admin/students">Cancel</Link>
            </Button>
            <Button type="submit">{isNew ? "Create Student" : "Save Changes"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
