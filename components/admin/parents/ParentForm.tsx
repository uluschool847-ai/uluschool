"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  type ParentActionState,
  createParentAction,
  updateParentAction,
} from "@/app/(admin)/admin/parents/actions";
import { TemporaryCredentialsPanel } from "@/components/admin/users/TemporaryCredentialsPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ParentFormProps = {
  mode: "create" | "edit";
  parent?: {
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

const initialParentActionState: ParentActionState = { success: false };

function getParentActionError(state: ParentActionState) {
  if (state.success) return undefined;
  if (state.message) return state.message;

  const message = Object.values(state.errors ?? {})
    .flat()
    .filter((value): value is string => Boolean(value))
    .join(" ");
  return message || undefined;
}

function ParentFlash({ message, error }: { message?: string; error?: string }) {
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

export function ParentForm({
  mode,
  parent,
  flashMessage,
  flashError,
  successRedirect,
  errorRedirect,
}: ParentFormProps) {
  const isNew = mode === "create";
  const [createState, createFormAction] = useActionState(
    createParentAction,
    initialParentActionState,
  );
  const formAction = isNew ? createFormAction : updateParentAction;
  const createError = getParentActionError(createState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isNew ? "Create Parent" : "Edit Parent"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ParentFlash
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
          {!isNew && parent ? <input type="hidden" name="id" value={parent.id} /> : null}

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
                defaultValue={parent?.fullName ?? ""}
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
                defaultValue={parent?.email ?? ""}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phoneWhatsapp">Phone / WhatsApp</Label>
            <Input
              id="phoneWhatsapp"
              name="phoneWhatsapp"
              type="tel"
              defaultValue={parent?.phoneWhatsapp ?? ""}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Parent portal access is created through this account form and cannot be changed to a
            different account type here.
          </p>

          <div className="flex justify-end gap-3">
            <Button asChild variant="outline">
              <Link href="/admin/parents">Cancel</Link>
            </Button>
            <Button type="submit">{isNew ? "Create Parent" : "Save Changes"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
