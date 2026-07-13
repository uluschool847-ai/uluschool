"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  type StudentActionState,
  createStudentAction,
  updateStudentAction,
} from "@/app/(admin)/admin/students/actions";
import { TemporaryCredentialsPanel } from "@/components/admin/users/TemporaryCredentialsPanel";
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

const initialStudentActionState: StudentActionState = { success: false };

function getStudentActionError(state: StudentActionState) {
  if (state.success) return undefined;
  if (state.message) return state.message;

  const message = Object.values(state.errors ?? {})
    .flat()
    .filter((value): value is string => Boolean(value))
    .join(" ");
  return message || undefined;
}

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
  const [createState, createFormAction] = useActionState(
    createStudentAction,
    initialStudentActionState,
  );
  const formAction = isNew ? createFormAction : updateStudentAction;
  const createError = getStudentActionError(createState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isNew ? "Create Student" : "Edit Student"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <StudentFlash
          message={isNew && createState.success ? createState.message : flashMessage}
          error={isNew && createState.success ? undefined : (createError ?? flashError)}
        />

        {isNew && createState.accountEmail && createState.temporaryPassword ? (
          <TemporaryCredentialsPanel
            email={createState.accountEmail}
            temporaryPassword={createState.temporaryPassword}
          />
        ) : null}

        <form
          action={formAction as unknown as (formData: FormData) => void}
          className="space-y-6"
          noValidate
        >
          {!isNew ? (
            <>
              <input type="hidden" name="flash" value="true" />
              <input type="hidden" name="successRedirect" value={successRedirect} />
              <input type="hidden" name="errorRedirect" value={errorRedirect} />
            </>
          ) : null}
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
