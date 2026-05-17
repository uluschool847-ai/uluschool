"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { loginAction } from "@/app/portal/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { LoginFormState } from "@/lib/validations/auth";

const initialLoginState: LoginFormState = {
  success: false,
  message: "",
};

function SubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-fit" disabled={pending || disabled}>
      {pending ? "Signing in..." : "Login"}
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

export function PortalLoginForm({ nextPath }: { nextPath?: string }) {
  const [state, action] = useActionState(loginAction, initialLoginState);
  const isRateLimited = Boolean(state.retryAfter && state.retryAfter > 0);
  const showGenericValidationState = state.message === "Invalid input";

  return (
    <form action={action} className="grid gap-4" noValidate>
      {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
      <div className="grid gap-2">
        <Label htmlFor="portalEmail">
          Email <span aria-hidden="true">*</span>
        </Label>
        <Input
          id="portalEmail"
          name="email"
          type="email"
          placeholder="name@ulu..."
          className={cn(
            state.errors?.email?.length ? "border-rose-300 dark:border-rose-500/60" : "",
          )}
          aria-required="true"
          aria-describedby={
            state.errors?.email?.length && !showGenericValidationState
              ? "portal-email-error"
              : undefined
          }
          required
        />
        {!showGenericValidationState ? (
          <FieldError id="portal-email-error" error={state.errors?.email?.[0]} />
        ) : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="portalPassword">
          Password <span aria-hidden="true">*</span>
        </Label>
        <Input
          id="portalPassword"
          name="password"
          type="password"
          placeholder="Password"
          className={cn(
            state.errors?.password?.length ? "border-rose-300 dark:border-rose-500/60" : "",
          )}
          aria-required="true"
          aria-describedby={
            state.errors?.password?.length && !showGenericValidationState
              ? "portal-password-error"
              : undefined
          }
          required
        />
        {!showGenericValidationState ? (
          <FieldError id="portal-password-error" error={state.errors?.password?.[0]} />
        ) : null}
      </div>
      <SubmitButton disabled={isRateLimited} />
      {state.message ? (
        <output
          role={state.success ? undefined : "alert"}
          className={state.success ? "text-sm text-emerald-600" : "text-sm text-destructive"}
        >
          {state.message}
        </output>
      ) : null}
    </form>
  );
}
