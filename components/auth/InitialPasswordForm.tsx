"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { changeInitialPasswordAction } from "@/app/portal/setup/password/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { InitialPasswordFormState } from "@/lib/validations/initial-password";

const initialState: InitialPasswordFormState = {
  success: false,
  message: "",
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-fit" disabled={pending}>
      {pending ? "Changing password..." : "Change password"}
    </Button>
  );
}

function FieldError({ error, id }: { error?: string; id: string }) {
  if (!error) return null;

  return (
    <p id={id} className="text-sm text-destructive" role="alert">
      {error}
    </p>
  );
}

export function InitialPasswordForm() {
  const [state, action] = useActionState(changeInitialPasswordAction, initialState);

  return (
    <form action={action} className="grid gap-4" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="currentPassword">
          Current password <span aria-hidden="true">*</span>
        </Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          aria-required="true"
          aria-invalid={Boolean(state.errors?.currentPassword?.length)}
          aria-describedby={
            state.errors?.currentPassword?.length ? "current-password-error" : undefined
          }
          className={cn(state.errors?.currentPassword?.length ? "border-destructive" : "")}
          required
        />
        <FieldError id="current-password-error" error={state.errors?.currentPassword?.[0]} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="newPassword">
          New password <span aria-hidden="true">*</span>
        </Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          aria-required="true"
          aria-invalid={Boolean(state.errors?.newPassword?.length)}
          aria-describedby={state.errors?.newPassword?.length ? "new-password-error" : undefined}
          className={cn(state.errors?.newPassword?.length ? "border-destructive" : "")}
          required
        />
        <FieldError id="new-password-error" error={state.errors?.newPassword?.[0]} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="confirmPassword">
          Confirm new password <span aria-hidden="true">*</span>
        </Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          aria-required="true"
          aria-invalid={Boolean(state.errors?.confirmPassword?.length)}
          aria-describedby={
            state.errors?.confirmPassword?.length ? "confirm-password-error" : undefined
          }
          className={cn(state.errors?.confirmPassword?.length ? "border-destructive" : "")}
          required
        />
        <FieldError id="confirm-password-error" error={state.errors?.confirmPassword?.[0]} />
      </div>

      <SubmitButton />

      {state.message ? (
        <output className="text-sm text-destructive" role="alert">
          {state.message}
        </output>
      ) : null}
    </form>
  );
}
