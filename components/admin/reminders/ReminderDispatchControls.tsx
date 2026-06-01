"use client";

import * as React from "react";
import * as ReactDom from "react-dom";

import { type ReminderDispatchState, runReminderDispatchAction } from "@/app/(admin)/admin/actions";
import { Button } from "@/components/ui/button";

const initialReminderDispatchState: ReminderDispatchState = {
  status: "idle",
  message: "",
};

type ReminderFormAction = (formData: FormData) => void | Promise<void>;
type ReminderDispatchAction = (
  state: ReminderDispatchState,
  formData: FormData,
) => Promise<ReminderDispatchState>;
type NativeActionStateHook = (
  action: ReminderDispatchAction,
  initialState: ReminderDispatchState,
) =>
  | [ReminderDispatchState, ReminderFormAction]
  | [ReminderDispatchState, ReminderFormAction, boolean];
type NativeFormStatusHook = () => { pending: boolean };

const reactWithActionState = React as typeof React & {
  useActionState?: NativeActionStateHook;
};
const reactDomWithFormStatus = ReactDom as typeof ReactDom & {
  useFormStatus?: NativeFormStatusHook;
};

function useReminderActionState(
  action: ReminderDispatchAction,
  initialState: ReminderDispatchState,
): [ReminderDispatchState, ReminderFormAction] {
  const [fallbackState, setFallbackState] = React.useState(initialState);
  const [, startTransition] = React.useTransition();
  const nativeUseActionState = reactWithActionState.useActionState;

  const fallbackAction = React.useCallback<ReminderFormAction>(
    (formData) => {
      startTransition(() => {
        void action(fallbackState, formData)
          .then(setFallbackState)
          .catch(() => {
            setFallbackState({
              status: "error",
              message:
                "Reminder job failed. No success audit was written. Try again or check the server logs.",
            });
          });
      });
    },
    [action, fallbackState],
  );

  if (typeof nativeUseActionState === "function") {
    const [state, formAction] = nativeUseActionState(action, initialState);
    return [state, formAction];
  }

  return [fallbackState, fallbackAction];
}

function useCompatibleFormStatus() {
  const nativeUseFormStatus = reactDomWithFormStatus.useFormStatus;
  if (typeof nativeUseFormStatus === "function") {
    return nativeUseFormStatus();
  }
  return { pending: false };
}

function SubmitButton({
  label,
  pendingLabel,
  variant = "default",
}: {
  label: string;
  pendingLabel: string;
  variant?: "default" | "secondary";
}) {
  const { pending } = useCompatibleFormStatus();

  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function ReminderDispatchControls() {
  const [state, action] = useReminderActionState(
    runReminderDispatchAction as ReminderDispatchAction,
    initialReminderDispatchState,
  );

  return (
    <div className="space-y-3">
      {state.message ? (
        <output
          className={`block rounded-md border px-3 py-2 text-sm ${
            state.status === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </output>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <form action={action}>
          <SubmitButton label="Run Reminder Job Now" pendingLabel="Running reminder job..." />
        </form>
        <form action={action}>
          <input type="hidden" name="dryRun" value="true" />
          <SubmitButton
            label="Dry Run Reminder Job"
            pendingLabel="Running dry run..."
            variant="secondary"
          />
        </form>
      </div>
    </div>
  );
}
