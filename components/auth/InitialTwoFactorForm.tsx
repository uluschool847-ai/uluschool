"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  type InitialTwoFactorActionState,
  beginInitialTwoFactorSetupAction,
  confirmInitialTwoFactorSetupAction,
} from "@/app/portal/setup/2fa/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: InitialTwoFactorActionState = {
  phase: "idle",
  success: false,
  message: "",
};

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-fit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function ActionMessage({ state }: { state: InitialTwoFactorActionState }) {
  if (!state.message) return null;

  if (state.phase === "error") {
    return (
      <p className="text-sm text-destructive" role="alert">
        {state.message}
      </p>
    );
  }

  return <p className="text-sm text-muted-foreground">{state.message}</p>;
}

export function InitialTwoFactorForm() {
  const [setupState, beginSetup] = useActionState(beginInitialTwoFactorSetupAction, initialState);
  const [confirmState, confirmSetup] = useActionState(
    confirmInitialTwoFactorSetupAction,
    initialState,
  );

  if (confirmState.phase === "complete") {
    return (
      <div className="grid gap-5" aria-live="polite">
        <div className="grid gap-2">
          <h2 className="font-heading text-lg font-semibold">Save Your Backup Codes</h2>
          <p className="text-sm text-muted-foreground">{confirmState.message}</p>
        </div>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Backup codes">
          {confirmState.backupCodes.map((code) => (
            <li key={code} className="border border-secondary px-3 py-2 font-mono text-sm">
              {code}
            </li>
          ))}
        </ul>
        <Button asChild className="w-fit">
          <Link href={confirmState.continueHref}>Continue to admin</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      {setupState.phase !== "setup" ? (
        <form action={beginSetup} className="grid gap-3">
          <SubmitButton label="Set up authenticator" pendingLabel="Preparing authenticator..." />
          <ActionMessage state={setupState} />
        </form>
      ) : (
        <div className="grid gap-5">
          <ActionMessage state={setupState} />
          <div className="grid gap-2 border border-secondary p-4">
            <p className="text-sm font-medium">Manual setup key</p>
            <code className="break-all text-sm">{setupState.setupSecret}</code>
            <p className="text-sm font-medium">Authenticator URI</p>
            <code className="break-all text-xs text-muted-foreground">{setupState.otpAuthUrl}</code>
          </div>
          <form action={confirmSetup} className="grid gap-4" noValidate>
            <div className="grid gap-2">
              <Label htmlFor="initial-two-factor-code">
                Authenticator code <span aria-hidden="true">*</span>
              </Label>
              <Input
                id="initial-two-factor-code"
                name="code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
                placeholder="123456"
                aria-required="true"
                required
              />
            </div>
            <SubmitButton label="Confirm and enable" pendingLabel="Enabling..." />
            <ActionMessage state={confirmState} />
          </form>
        </div>
      )}
    </div>
  );
}
