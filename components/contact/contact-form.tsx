"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";

import { submitContactEnquiry } from "@/app/contact/actions";
import { TurnstileWidget } from "@/components/forms/turnstile-widget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ContactFormState } from "@/lib/validations/contact";

const initialContactFormState: ContactFormState = {
  success: false,
  message: "",
};

function FieldError({ errors, id }: { errors?: string[]; id: string }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="mt-1 text-sm text-destructive" role="alert">
      {errors[0]}
    </p>
  );
}

function useFieldTone(state: ContactFormState) {
  return (field: keyof NonNullable<ContactFormState["errors"]>) => {
    if (state.errors?.[field]?.length) {
      return "border-rose-300 focus-visible:ring-rose-200 dark:border-rose-500/60";
    }

    if (state.message && state.success) {
      return "border-emerald-300 focus-visible:ring-emerald-200 dark:border-emerald-500/60";
    }

    return "";
  };
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Submitting..." : "Submit"}
    </Button>
  );
}

function formatSubmittedAt(value?: string) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function SuccessMessage({ state }: { state: ContactFormState }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
      <h2 className="text-xl font-semibold text-emerald-900">
        Thank you! We've received your request.
      </h2>
      <p className="mt-2 text-sm text-emerald-800">Your message is now in our review queue.</p>
      {state.referenceId ? (
        <p className="mt-4 text-sm font-semibold text-emerald-900">
          Reference ID: {state.referenceId}
        </p>
      ) : null}
      {state.submittedAt ? (
        <p className="mt-2 text-sm text-emerald-800">
          Submitted at: {formatSubmittedAt(state.submittedAt)}
        </p>
      ) : null}
      <div className="mt-4 rounded-lg bg-white/70 p-4 text-sm text-emerald-900">
        <p className="font-semibold">Next Steps</p>
        <p className="mt-1">
          {state.nextSteps ??
            "Our manager will contact you within 24 hours to confirm the details."}
        </p>
      </div>
    </div>
  );
}

export function ContactForm() {
  const [state, formAction] = useActionState(submitContactEnquiry, initialContactFormState);
  const startedAtRef = useRef(Date.now());
  const fieldTone = useFieldTone(state);
  const showGenericValidationState =
    !state.success && state.message === "Please enter valid details in the highlighted fields.";

  if (state.success) {
    return <SuccessMessage state={state} />;
  }

  return (
    <form action={formAction} className="rounded-xl border bg-card p-6" noValidate>
      <h2 className="text-xl font-semibold">Inquiry Form</h2>
      <input
        type="text"
        name="companyWebsite"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden="true"
      />
      <input type="hidden" name="startedAt" value={startedAtRef.current} />

      <div className="mt-5 grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="fullName">
            Full Name <span aria-hidden="true">*</span>
          </Label>
          <Input
            id="fullName"
            name="fullName"
            placeholder="Full Name"
            className={cn(fieldTone("fullName"))}
            required
            aria-required="true"
            aria-describedby={
              state.errors?.fullName?.length && !showGenericValidationState
                ? "contact-full-name-error"
                : undefined
            }
          />
          {!showGenericValidationState ? (
            <FieldError id="contact-full-name-error" errors={state.errors?.fullName} />
          ) : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="email">
              Email <span aria-hidden="true">*</span>
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="Email"
              className={cn(fieldTone("email"))}
              required
              aria-required="true"
              aria-describedby={
                state.errors?.email?.length && !showGenericValidationState
                  ? "contact-email-error"
                  : undefined
              }
            />
            {!showGenericValidationState ? (
              <FieldError id="contact-email-error" errors={state.errors?.email} />
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phoneWhatsapp">Phone / WhatsApp</Label>
            <Input
              id="phoneWhatsapp"
              name="phoneWhatsapp"
              placeholder="+254..."
              className={cn(fieldTone("phoneWhatsapp"))}
              aria-describedby={
                state.errors?.phoneWhatsapp?.length ? "contact-phone-whatsapp-error" : undefined
              }
            />
            <FieldError id="contact-phone-whatsapp-error" errors={state.errors?.phoneWhatsapp} />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="studentGrade">Student Grade</Label>
          <Input
            id="studentGrade"
            name="studentGrade"
            placeholder="e.g. Year 7 / IGCSE"
            className={cn(fieldTone("studentGrade"))}
            aria-describedby={
              state.errors?.studentGrade?.length ? "contact-student-grade-error" : undefined
            }
          />
          <FieldError id="contact-student-grade-error" errors={state.errors?.studentGrade} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="message">
            Message <span aria-hidden="true">*</span>
          </Label>
          <Textarea
            id="message"
            name="message"
            aria-label="Message"
            placeholder="Tell us what support you need."
            className={cn("min-h-[130px]", fieldTone("message"))}
            required
            aria-required="true"
            aria-describedby={
              state.errors?.message?.length && !showGenericValidationState
                ? "contact-message-error"
                : undefined
            }
          />
          {!showGenericValidationState ? (
            <FieldError id="contact-message-error" errors={state.errors?.message} />
          ) : null}
        </div>

        <TurnstileWidget />

        <div className="flex items-center gap-3">
          <SubmitButton />
          {state.message ? (
            <output
              role={state.success ? undefined : "alert"}
              className={state.success ? "text-sm text-emerald-600" : "text-sm text-destructive"}
              aria-live="polite"
            >
              {state.message}
            </output>
          ) : null}
        </div>
      </div>
    </form>
  );
}
