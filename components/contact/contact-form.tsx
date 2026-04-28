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

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p className="mt-1 text-sm text-destructive" role="alert">
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

export function ContactForm() {
  const [state, formAction] = useActionState(submitContactEnquiry, initialContactFormState);
  const startedAtRef = useRef(Date.now());
  const fieldTone = useFieldTone(state);

  return (
    <form action={formAction} className="rounded-xl border bg-card p-6">
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
          <Label htmlFor="fullName">Full Name</Label>
          <Input
            id="fullName"
            name="fullName"
            placeholder="Full Name"
            className={cn(fieldTone("fullName"))}
          />
          <FieldError errors={state.errors?.fullName} />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="Email"
              className={cn(fieldTone("email"))}
            />
            <FieldError errors={state.errors?.email} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phoneWhatsapp">Phone / WhatsApp</Label>
            <Input
              id="phoneWhatsapp"
              name="phoneWhatsapp"
              placeholder="+254..."
              className={cn(fieldTone("phoneWhatsapp"))}
            />
            <FieldError errors={state.errors?.phoneWhatsapp} />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="studentGrade">Student Grade</Label>
          <Input
            id="studentGrade"
            name="studentGrade"
            placeholder="e.g. Year 7 / IGCSE"
            className={cn(fieldTone("studentGrade"))}
          />
          <FieldError errors={state.errors?.studentGrade} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="message">Message</Label>
          <Textarea
            id="message"
            name="message"
            placeholder="Tell us what support you need."
            className={cn("min-h-[130px]", fieldTone("message"))}
          />
          <FieldError errors={state.errors?.message} />
        </div>

        <TurnstileWidget />

        <div className="flex items-center gap-3">
          <SubmitButton />
          {state.message ? (
            <output
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
