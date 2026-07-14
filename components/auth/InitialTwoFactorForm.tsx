"use client";

import { Copy } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  type InitialTwoFactorActionState,
  beginInitialTwoFactorSetupAction,
  confirmInitialTwoFactorSetupAction,
  recoverInitialTwoFactorHandoffAction,
} from "@/app/portal/setup/2fa/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: InitialTwoFactorActionState = {
  phase: "idle",
  success: false,
  message: "",
};

type CopyFeedback = {
  key: "manual" | "uri" | "backup";
  value: string;
  status: "copied" | "error";
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

  if (state.phase === "error" || state.phase === "restart-required") {
    return (
      <p className="text-sm text-destructive" role="alert">
        {state.message}
      </p>
    );
  }

  if (state.phase === "handoff-required") {
    return (
      <output className="text-sm text-muted-foreground" aria-live="polite">
        {state.message}
      </output>
    );
  }

  return <p className="text-sm text-muted-foreground">{state.message}</p>;
}

function CopyButton({ label, onCopy }: { label: string; onCopy: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={label}
      title={label}
      onClick={onCopy}
    >
      <Copy aria-hidden="true" className="size-4" />
    </Button>
  );
}

export function InitialTwoFactorForm({
  requiresHandoff = false,
  completedHref,
}: {
  requiresHandoff?: boolean;
  completedHref?: string;
}) {
  const [setupState, beginSetup] = useActionState(beginInitialTwoFactorSetupAction, initialState);
  const [confirmState, confirmSetup] = useActionState(
    confirmInitialTwoFactorSetupAction,
    initialState,
  );
  const [recoveryState, recoverHandoff] = useActionState(
    recoverInitialTwoFactorHandoffAction,
    initialState,
  );
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);
  const [restartFromCapability, setRestartFromCapability] = useState<string | null>(null);
  const completeHeadingRef = useRef<HTMLHeadingElement>(null);
  const completeState =
    confirmState.phase === "complete"
      ? confirmState
      : recoveryState.phase === "complete"
        ? recoveryState
        : null;

  useEffect(() => {
    if (completeState) completeHeadingRef.current?.focus();
  }, [completeState]);

  async function copyValue(key: CopyFeedback["key"], value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyFeedback({ key, value, status: "copied" });
    } catch {
      setCopyFeedback({ key, value, status: "error" });
    }
  }

  function copyStatus(key: CopyFeedback["key"], value: string, label: string) {
    if (copyFeedback?.key !== key || copyFeedback.value !== value) return "";
    return copyFeedback.status === "copied"
      ? `${label} copied.`
      : `Could not copy ${label.toLowerCase()}.`;
  }

  if (completeState) {
    const codesText = completeState.backupCodes.join("\n");
    return (
      <div className="grid gap-5">
        <div className="grid gap-2">
          <h2 ref={completeHeadingRef} tabIndex={-1} className="font-heading text-lg font-semibold">
            Save Your Backup Codes
          </h2>
          <p className="text-sm text-muted-foreground">{completeState.message}</p>
        </div>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Backup codes">
          {completeState.backupCodes.map((code) => (
            <li key={code} className="border border-secondary px-3 py-2 font-mono text-sm">
              {code}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <CopyButton
            label="Copy all backup codes"
            onCopy={() => void copyValue("backup", codesText)}
          />
          <Button asChild className="w-fit">
            <Link href={completeState.continueHref}>Continue to admin</Link>
          </Button>
        </div>
        <output className="min-h-5 text-sm text-muted-foreground" aria-live="polite">
          {copyStatus("backup", codesText, "Backup codes")}
        </output>
      </div>
    );
  }

  const hasFreshRestartSetup =
    confirmState.phase === "restart-required" &&
    setupState.phase === "setup" &&
    restartFromCapability !== null &&
    setupState.setupCapability !== restartFromCapability;

  const handoffState =
    recoveryState.phase === "handoff-required"
      ? recoveryState
      : confirmState.phase === "handoff-required"
        ? confirmState
        : setupState.phase === "handoff-required"
          ? setupState
          : requiresHandoff
            ? ({
                phase: "handoff-required",
                success: true,
                message:
                  "Two-factor authentication is enabled, but secure sign-in and backup-code delivery still need to be completed.",
              } satisfies InitialTwoFactorActionState)
            : null;

  if (handoffState) {
    return (
      <form action={recoverHandoff} className="grid gap-3">
        <ActionMessage state={handoffState} />
        <SubmitButton label="Finish secure sign-in" pendingLabel="Finishing secure sign-in..." />
      </form>
    );
  }

  if (confirmState.phase === "restart-required" && !hasFreshRestartSetup) {
    return (
      <form
        action={beginSetup}
        className="grid gap-3"
        onSubmit={() => {
          if (setupState.phase === "setup") {
            setRestartFromCapability(setupState.setupCapability);
          }
        }}
      >
        <ActionMessage state={confirmState} />
        <SubmitButton label="Start setup again" pendingLabel="Restarting setup..." />
      </form>
    );
  }

  if (completedHref) {
    return (
      <div className="grid gap-4">
        <h2 className="font-heading text-lg font-semibold">Two-Factor Setup Complete</h2>
        <p className="text-sm text-muted-foreground">
          Backup codes are shown only once. Continue with the verified administrator session.
        </p>
        <Button asChild className="w-fit">
          <Link href={completedHref}>Continue to admin</Link>
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
          <div className="grid gap-3 border border-secondary p-4">
            <div className="grid grid-cols-[1fr_auto] items-center gap-2">
              <div className="grid min-w-0 gap-1">
                <p className="text-sm font-medium">Manual setup key</p>
                <code data-testid="initial-2fa-manual-key" className="break-all text-sm">
                  {setupState.setupSecret}
                </code>
              </div>
              <CopyButton
                label="Copy manual setup key"
                onCopy={() => void copyValue("manual", setupState.setupSecret)}
              />
            </div>
            <div className="grid grid-cols-[1fr_auto] items-center gap-2">
              <div className="grid min-w-0 gap-1">
                <p className="text-sm font-medium">Authenticator URI</p>
                <code className="break-all text-xs text-muted-foreground">
                  {setupState.otpAuthUrl}
                </code>
              </div>
              <CopyButton
                label="Copy authenticator URI"
                onCopy={() => void copyValue("uri", setupState.otpAuthUrl)}
              />
            </div>
            <output className="min-h-5 text-sm text-muted-foreground" aria-live="polite">
              {copyStatus("manual", setupState.setupSecret, "Manual setup key") ||
                copyStatus("uri", setupState.otpAuthUrl, "Authenticator URI")}
            </output>
          </div>
          <form action={confirmSetup} className="grid gap-4" noValidate>
            <input type="hidden" name="setupCapability" value={setupState.setupCapability} />
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
