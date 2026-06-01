"use client";

import { type ReactNode, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type ConfirmedSubmitProps = {
  children: ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmWhenFieldName?: string;
  confirmWhenFieldValue?: string;
};

export function ConfirmedSubmit({
  children,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmWhenFieldName,
  confirmWhenFieldValue,
}: ConfirmedSubmitProps) {
  const titleId = useId();
  const descriptionId = useId();
  const pendingFormRef = useRef<HTMLFormElement | null>(null);
  const allowNextSubmitRef = useRef(false);
  const [open, setOpen] = useState(false);

  function handleSubmitCapture(event: React.FormEvent<HTMLDivElement>) {
    const form = event.target as HTMLFormElement;

    if (allowNextSubmitRef.current) {
      allowNextSubmitRef.current = false;
      pendingFormRef.current = null;
      return;
    }

    if (confirmWhenFieldName) {
      const formData = new FormData(form);
      const value = formData.get(confirmWhenFieldName);
      const shouldConfirm =
        confirmWhenFieldValue === undefined ? value !== null : value === confirmWhenFieldValue;

      if (!shouldConfirm) {
        return;
      }
    }

    event.preventDefault();
    event.stopPropagation();
    pendingFormRef.current = form;
    setOpen(true);
  }

  function closeDialog() {
    pendingFormRef.current = null;
    setOpen(false);
  }

  function confirmSubmit() {
    const form = pendingFormRef.current;
    if (!form) {
      closeDialog();
      return;
    }

    allowNextSubmitRef.current = true;
    setOpen(false);
    form.requestSubmit();
  }

  return (
    <div onSubmitCapture={handleSubmitCapture}>
      {children}
      {open ? (
        <dialog
          open
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        >
          <div className="w-full max-w-md rounded-md border border-slate-200 bg-white p-6 shadow-xl">
            <h2 id={titleId} className="text-lg font-semibold text-slate-950">
              {title}
            </h2>
            <p id={descriptionId} className="mt-2 text-sm text-slate-600">
              {description}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={closeDialog}>
                {cancelLabel}
              </Button>
              <Button type="button" variant="destructive" onClick={confirmSubmit}>
                {confirmLabel}
              </Button>
            </div>
          </div>
        </dialog>
      ) : null}
    </div>
  );
}
