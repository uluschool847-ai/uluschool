"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  beginTwoFactorSetupAction,
  confirmTwoFactorSetupAction,
  disableTwoFactorAction,
  type TwoFactorSetupState,
} from "@/app/(admin)/admin/security/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: TwoFactorSetupState = {
  success: false,
  message: "",
};

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit">{pending ? pendingLabel : label}</Button>;
}

export function TwoFactorSettings({ enabled }: { enabled: boolean }) {
  const [setupState, beginSetup] = useActionState(beginTwoFactorSetupAction, initialState);
  const [confirmState, confirmSetup] = useActionState(confirmTwoFactorSetupAction, initialState);
  const [disableState, disableSetup] = useActionState(disableTwoFactorAction, initialState);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Current status: <strong>{enabled ? "enabled" : "disabled"}</strong>
      </p>

      {!enabled ? (
        <form action={beginSetup} className="space-y-2">
          <SubmitButton label="Generate 2FA Secret" pendingLabel="Generating..." />
          {setupState.message ? (
            <p className={setupState.success ? "text-sm text-emerald-600" : "text-sm text-destructive"}>
              {setupState.message}
            </p>
          ) : null}
        </form>
      ) : null}

      {!enabled && setupState.setupSecret ? (
        <div className="space-y-3 rounded-lg border border-secondary p-4">
          <p className="text-sm">
            <strong>Manual secret:</strong> <code>{setupState.setupSecret}</code>
          </p>
          <p className="text-sm text-muted-foreground">
            If QR import is supported, use this OTP URI:
          </p>
          <p className="break-all text-xs text-muted-foreground">{setupState.otpAuthUrl}</p>

          <form action={confirmSetup} className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-sm">
              Confirm code
              <Input name="code" inputMode="numeric" maxLength={6} placeholder="123456" />
            </label>
            <SubmitButton label="Enable 2FA" pendingLabel="Enabling..." />
          </form>
          {confirmState.message ? (
            <p className={confirmState.success ? "text-sm text-emerald-600" : "text-sm text-destructive"}>
              {confirmState.message}
            </p>
          ) : null}

          {confirmState.backupCodes?.length ? (
            <div className="rounded-md border border-secondary p-3">
              <p className="mb-2 text-sm font-medium">Backup codes (save now):</p>
              <ul className="grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
                {confirmState.backupCodes.map((code) => (
                  <li key={code}>
                    <code>{code}</code>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {enabled ? (
        <form action={disableSetup} className="space-y-2">
          <SubmitButton label="Disable 2FA" pendingLabel="Disabling..." />
          {disableState.message ? (
            <p className={disableState.success ? "text-sm text-emerald-600" : "text-sm text-destructive"}>
              {disableState.message}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
