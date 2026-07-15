"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import type { CatalogueLevel, CatalogueSubject } from "@/lib/repositories/catalogue-repository";
import type { EnrolmentFormState, EnrolmentInput } from "@/lib/validations/enrolment";

import { submitEnrolment } from "@/app/enrol/actions";
import { TurnstileWidget } from "@/components/forms/turnstile-widget";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const initialState: EnrolmentFormState = {
  success: false,
  message: "",
};

const steps = ["Parent Info", "Student Details", "Schedule Trial"];

type FieldKey = keyof EnrolmentInput;
type EnrolFormProps = {
  subjects?: CatalogueSubject[];
  levels?: CatalogueLevel[];
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      className="w-full md:w-auto"
      disabled={pending}
      aria-label="Submit enrolment"
    >
      {pending ? "Submitting..." : "Submit Enrolment"}
    </Button>
  );
}

function FieldError({ errors, id }: { errors?: string[]; id: string }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="mt-1 text-sm text-destructive" role="alert">
      {errors[0]}
    </p>
  );
}

function useFieldTone(state: EnrolmentFormState) {
  return (field: FieldKey) => {
    if (state.errors?.[field]?.length) {
      return "border-rose-300 focus-visible:ring-rose-200 dark:border-rose-500/60";
    }

    if (state.message) {
      return "border-emerald-300 focus-visible:ring-emerald-200 dark:border-emerald-500/60";
    }

    return "";
  };
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

function SuccessMessage({ state }: { state: EnrolmentFormState }) {
  return (
    <Card className="overflow-hidden border-emerald-200 bg-emerald-50">
      <CardHeader className="border-b border-emerald-200">
        <CardTitle className="text-emerald-900">Thank you! We've received your request.</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-6 md:p-8">
        <p className="text-sm text-emerald-800">
          Your enrolment request is now in our admissions review queue.
        </p>
        {state.referenceId ? (
          <p className="text-sm font-semibold text-emerald-900">
            Reference ID: {state.referenceId}
          </p>
        ) : null}
        {state.submittedAt ? (
          <p className="text-sm text-emerald-800">
            Submitted at: {formatSubmittedAt(state.submittedAt)}
          </p>
        ) : null}
        <div className="rounded-lg bg-white/70 p-4 text-sm text-emerald-900">
          <p className="font-semibold">Next Steps</p>
          <p className="mt-1">
            {state.nextSteps ??
              "Our manager will contact you within 24 hours to confirm the details."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function EnrolForm({ subjects, levels }: EnrolFormProps) {
  const [state, formAction] = useActionState(submitEnrolment, initialState);
  const [step, setStep] = useState(1);
  const [curriculumLevel, setCurriculumLevel] = useState("");
  const [clientValidationMessage, setClientValidationMessage] = useState("");
  const startedAtRef = useRef(Date.now());
  const formRef = useRef<HTMLFormElement>(null);
  const fieldTone = useFieldTone(state);
  const showGenericValidationState =
    !state.success && state.message === "Please enter valid details in the highlighted fields.";

  const subjectOptions = subjects ?? [];
  const levelOptions = levels ?? [];

  useEffect(() => {
    if (!state.errors) return;

    const stepOneFields: FieldKey[] = ["parentGuardianName", "email", "phoneWhatsapp"];
    const stepTwoFields: FieldKey[] = [
      "studentName",
      "ageYearLevel",
      "curriculumLevel",
      "subjects",
    ];

    if (stepOneFields.some((field) => state.errors?.[field]?.length)) {
      setStep(1);
      return;
    }

    if (stepTwoFields.some((field) => state.errors?.[field]?.length)) {
      setStep(2);
      return;
    }

    setStep(3);
  }, [state.errors]);

  if (!subjects || !levels) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-secondary bg-secondary/30">
          <CardTitle>Enrolment Form</CardTitle>
        </CardHeader>
        <CardContent className="p-6 md:p-8 text-sm text-muted-foreground">
          Loading catalogue...
        </CardContent>
      </Card>
    );
  }

  if (state.success) {
    return <SuccessMessage state={state} />;
  }

  function validateStepBeforeAdvance(currentStep: number) {
    const form = formRef.current;
    if (!form) {
      return true;
    }

    const stepSection = form.querySelector<HTMLElement>(`[data-step="${currentStep}"]`);
    if (!stepSection) {
      return true;
    }

    const requiredControls = Array.from(
      stepSection.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        "input[required], select[required], textarea[required]",
      ),
    );

    const hasInvalidRequiredControl = requiredControls.some((control) =>
      control instanceof HTMLInputElement && control.type === "checkbox"
        ? !control.checked
        : !control.value.trim(),
    );

    if (currentStep === 2) {
      const selectedSubjects = form.querySelectorAll('input[name="subjects"]:checked').length;
      if (!curriculumLevel || selectedSubjects === 0) {
        setClientValidationMessage("Please enter valid details in the highlighted fields.");
        return false;
      }
    }

    if (hasInvalidRequiredControl) {
      setClientValidationMessage("Please enter valid details in the highlighted fields.");
      return false;
    }

    setClientValidationMessage("");
    return true;
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-secondary bg-secondary/30">
        <CardTitle>Enrolment Form</CardTitle>
      </CardHeader>
      <CardContent className="p-6 md:p-8">
        <div className="mb-8">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">
            {steps.map((label, index) => (
              <span
                key={label}
                className={cn(index + 1 <= step ? "text-primary" : "text-muted-foreground")}
              >
                {label}
              </span>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {steps.map((label, index) => (
              <div
                key={label}
                className={cn("h-2 rounded-full", index + 1 <= step ? "bg-accent" : "bg-secondary")}
              />
            ))}
          </div>
        </div>

        <form
          ref={formRef}
          action={formAction}
          className="grid gap-6"
          noValidate
          onSubmit={(event) => {
            if (step !== 3 || !validateStepBeforeAdvance(3)) {
              event.preventDefault();
            }
          }}
        >
          <input
            type="text"
            name="companyWebsite"
            tabIndex={-1}
            autoComplete="off"
            className="hidden"
            aria-hidden="true"
          />
          <input type="hidden" name="startedAt" value={startedAtRef.current} />

          <section
            data-step="1"
            className={cn(step === 1 ? "grid gap-5" : "hidden")}
            aria-hidden={step !== 1}
          >
            <div className="floating-field">
              <Input
                id="parentGuardianName"
                name="parentGuardianName"
                placeholder=" "
                className={cn("peer h-14 pt-6", fieldTone("parentGuardianName"))}
                aria-required="true"
                required
                aria-describedby={
                  state.errors?.parentGuardianName?.length
                    ? "enrol-parent-guardian-name-error"
                    : undefined
                }
              />
              <Label htmlFor="parentGuardianName">
                Parent/Guardian Name <span aria-hidden="true">*</span>
              </Label>
              <FieldError
                id="enrol-parent-guardian-name-error"
                errors={!showGenericValidationState ? state.errors?.parentGuardianName : undefined}
              />
            </div>

            <div className="floating-field">
              <Input
                id="email"
                name="email"
                type="email"
                placeholder=" "
                className={cn("peer h-14 pt-6", fieldTone("email"))}
                aria-required="true"
                required
                aria-describedby={state.errors?.email?.length ? "enrol-email-error" : undefined}
              />
              <Label htmlFor="email">
                Email Address <span aria-hidden="true">*</span>
              </Label>
              <FieldError
                id="enrol-email-error"
                errors={!showGenericValidationState ? state.errors?.email : undefined}
              />
            </div>

            <div className="floating-field">
              <Input
                id="phoneWhatsapp"
                name="phoneWhatsapp"
                placeholder=" "
                className={cn("peer h-14 pt-6", fieldTone("phoneWhatsapp"))}
                aria-required="true"
                required
                aria-describedby={
                  state.errors?.phoneWhatsapp?.length ? "enrol-phone-whatsapp-error" : undefined
                }
              />
              <Label htmlFor="phoneWhatsapp">
                Phone / WhatsApp <span aria-hidden="true">*</span>
              </Label>
              <FieldError
                id="enrol-phone-whatsapp-error"
                errors={!showGenericValidationState ? state.errors?.phoneWhatsapp : undefined}
              />
            </div>
          </section>

          <section
            data-step="2"
            className={cn(step === 2 ? "grid gap-5" : "hidden")}
            aria-hidden={step !== 2}
          >
            <div className="floating-field">
              <Input
                id="studentName"
                name="studentName"
                placeholder=" "
                className={cn("peer h-14 pt-6", fieldTone("studentName"))}
                aria-required="true"
                required
                aria-describedby={
                  state.errors?.studentName?.length ? "enrol-student-name-error" : undefined
                }
              />
              <Label htmlFor="studentName">
                Student Name <span aria-hidden="true">*</span>
              </Label>
              <FieldError
                id="enrol-student-name-error"
                errors={!showGenericValidationState ? state.errors?.studentName : undefined}
              />
            </div>

            <div className="floating-field">
              <Input
                id="ageYearLevel"
                name="ageYearLevel"
                placeholder=" "
                className={cn("peer h-14 pt-6", fieldTone("ageYearLevel"))}
                aria-required="true"
                required
                aria-describedby={
                  state.errors?.ageYearLevel?.length ? "enrol-age-year-level-error" : undefined
                }
              />
              <Label htmlFor="ageYearLevel">
                Age / Year Level <span aria-hidden="true">*</span>
              </Label>
              <FieldError
                id="enrol-age-year-level-error"
                errors={!showGenericValidationState ? state.errors?.ageYearLevel : undefined}
              />
            </div>

            <div className="floating-field">
              <select
                id="curriculumLevel"
                name="curriculumLevel"
                className={cn(
                  "peer h-14 w-full rounded-md border border-input bg-background px-3 pt-6 text-sm",
                  fieldTone("curriculumLevel"),
                )}
                value={curriculumLevel}
                onChange={(event) => {
                  setCurriculumLevel(event.target.value);
                  setClientValidationMessage("");
                }}
                data-has-value={curriculumLevel ? "true" : "false"}
                aria-label="Curriculum level"
                required
                aria-describedby={
                  state.errors?.curriculumLevel?.length ? "enrol-curriculum-level-error" : undefined
                }
              >
                <option value="">Select level</option>
                {levelOptions.map((level) => (
                  <option key={level.id} value={level.slug}>
                    {level.name}
                  </option>
                ))}
              </select>
              <Label htmlFor="curriculumLevel">
                Curriculum Level <span aria-hidden="true">*</span>
              </Label>
              <FieldError
                id="enrol-curriculum-level-error"
                errors={!showGenericValidationState ? state.errors?.curriculumLevel : undefined}
              />
            </div>

            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium text-primary">
                Subject(s) <span aria-hidden="true">*</span>
              </legend>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {subjectOptions.map((subject) => (
                  <label
                    key={subject.id}
                    className={cn(
                      "flex items-center gap-2 rounded-md border bg-background px-3 py-3 text-sm",
                      state.errors?.subjects?.length
                        ? "border-rose-300 dark:border-rose-500/60"
                        : state.message
                          ? "border-emerald-300 dark:border-emerald-500/60"
                          : "border-secondary",
                    )}
                  >
                    <input
                      type="checkbox"
                      name="subjects"
                      value={subject.name}
                      className="h-4 w-4 rounded border-secondary"
                      aria-label={subject.name}
                    />
                    <span>{subject.name}</span>
                  </label>
                ))}
              </div>
              <FieldError
                id="enrol-subjects-error"
                errors={!showGenericValidationState ? state.errors?.subjects : undefined}
              />
            </fieldset>
          </section>

          <section
            data-step="3"
            className={cn(step === 3 ? "grid gap-5" : "hidden")}
            aria-hidden={step !== 3}
          >
            <div className="floating-field">
              <Input
                id="preferredSchedule"
                name="preferredSchedule"
                placeholder=" "
                className={cn("peer h-14 pt-6", fieldTone("preferredSchedule"))}
                aria-required="true"
                required
                aria-describedby={
                  state.errors?.preferredSchedule?.length
                    ? "enrol-preferred-schedule-error"
                    : undefined
                }
              />
              <Label htmlFor="preferredSchedule">
                Preferred Schedule <span aria-hidden="true">*</span>
              </Label>
              <FieldError
                id="enrol-preferred-schedule-error"
                errors={!showGenericValidationState ? state.errors?.preferredSchedule : undefined}
              />
            </div>

            <div className="floating-field">
              <Textarea
                id="additionalNotes"
                name="additionalNotes"
                placeholder=" "
                className={cn("peer min-h-[130px] pt-7", fieldTone("additionalNotes"))}
                aria-describedby={
                  state.errors?.additionalNotes?.length ? "enrol-additional-notes-error" : undefined
                }
              />
              <Label htmlFor="additionalNotes" className="top-6">
                Additional Notes
              </Label>
              <FieldError
                id="enrol-additional-notes-error"
                errors={state.errors?.additionalNotes}
              />
            </div>

            <div>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  name="consentAccepted"
                  value="true"
                  required
                  aria-describedby="enrol-consent-help enrol-consent-error"
                  className={cn("mt-0.5 h-4 w-4", fieldTone("consentAccepted"))}
                />
                <span id="enrol-consent-help">
                  I am the parent or guardian, or I am authorized to submit this child&apos;s
                  information, and I have read the{" "}
                  <Link href="/privacy-policy">Privacy Policy</Link>.
                </span>
              </label>
              <FieldError id="enrol-consent-error" errors={state.errors?.consentAccepted} />
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              {step > 1 ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setStep((value) => value - 1)}
                >
                  Back
                </Button>
              ) : null}
              {step < 3 ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (validateStepBeforeAdvance(step)) {
                      setStep((value) => value + 1);
                    }
                  }}
                >
                  Next Step
                </Button>
              ) : null}
            </div>

            {step === 3 ? <SubmitButton /> : null}
          </div>

          {step === 3 ? <TurnstileWidget /> : null}

          {clientValidationMessage ? (
            <output role="alert" className="text-sm text-destructive" aria-live="polite">
              {clientValidationMessage}
            </output>
          ) : null}

          {state.message ? (
            <output
              role={state.success ? undefined : "alert"}
              className={state.success ? "text-sm text-emerald-600" : "text-sm text-destructive"}
              aria-live="polite"
            >
              {state.message}
            </output>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
