"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { verify2faAction } from "@/app/portal/login/verify-2fa/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { TwoFactorFormState } from "@/lib/validations/two-factor";

const initialState: TwoFactorFormState = {
  success: false,
  message: "",
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Verifying..." : "Verify 2FA"}
    </Button>
  );
}

export function TwoFactorForm({ nextPath }: { nextPath?: string }) {
  const [state, action] = useActionState(verify2faAction, initialState);

  return (
    <form action={action} className="grid gap-4">
      {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
      <div className="grid gap-2">
        <Label htmlFor="code">Authenticator code</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          maxLength={6}
          placeholder="123456"
          className={cn(
            state.errors?.code?.length ? "border-rose-300 dark:border-rose-500/60" : "",
          )}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="backupCode">Backup code (optional)</Label>
        <Input
          id="backupCode"
          name="backupCode"
          placeholder="AB12CD34"
          className={cn(
            state.errors?.backupCode?.length ? "border-rose-300 dark:border-rose-500/60" : "",
          )}
        />
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
