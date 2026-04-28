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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-fit" disabled={pending}>
      {pending ? "Signing in..." : "Login"}
    </Button>
  );
}

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="text-sm text-destructive">{error}</p>;
}

export function PortalLoginForm({ nextPath }: { nextPath?: string }) {
  const [state, action] = useActionState(loginAction, initialLoginState);

  return (
    <form action={action} className="grid gap-4">
      {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
      <div className="grid gap-2">
        <Label htmlFor="portalEmail">Email</Label>
        <Input
          id="portalEmail"
          name="email"
          type="email"
          placeholder="name@ulu..."
          className={cn(
            state.errors?.email?.length ? "border-rose-300 dark:border-rose-500/60" : "",
          )}
          required
        />
        <FieldError error={state.errors?.email?.[0]} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="portalPassword">Password</Label>
        <Input
          id="portalPassword"
          name="password"
          type="password"
          placeholder="Password"
          className={cn(
            state.errors?.password?.length ? "border-rose-300 dark:border-rose-500/60" : "",
          )}
          required
        />
        <FieldError error={state.errors?.password?.[0]} />
      </div>
      <SubmitButton />
      {state.message ? (
        <output className={state.success ? "text-sm text-emerald-600" : "text-sm text-destructive"}>
          {state.message}
        </output>
      ) : null}
    </form>
  );
}
