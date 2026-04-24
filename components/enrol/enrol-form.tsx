"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { levels } from "@/lib/content";
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
const subjectOptions = [
  "Mathematics",
  "English",
  "Science",
  "Biology",
  "Chemistry",
  "Physics",
  "English Language",
  "Business Studies",
  "ICT",
  "Geography",
  "Kiswahili",
];

type FieldKey = keyof EnrolmentInput;

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

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p className="mt-1 text-sm text-destructive" role="alert">
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

export function EnrolForm() {
  const [state, formAction] = useActionState(submitEnrolment, initialState);
  const [step, setStep] = useState(1);
  const [curriculumLevel, setCurriculumLevel] = useState("");
  const startedAtRef = useRef(Date.now());
  const fieldTone = useFieldTone(state);

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

        <form action={formAction} className="grid gap-6">
          <input
            type="text"
            name="companyWebsite"
            tabIndex={-1}
            autoComplete="off"
            className="hidden"
            aria-hidden="true"
          />
          <input type="hidden" name="startedAt" value={startedAtRef.current} />

          <section className={cn(step === 1 ? "grid gap-5" : "hidden")} aria-hidden={step !== 1}>
            <div className="floating-field">
              <Input
                id="parentGuardianName"
                name="parentGuardianName"
                placeholder=" "
                className={cn("peer h-14 pt-6", fieldTone("parentGuardianName"))}
                aria-required="true"
              />
              <Label htmlFor="parentGuardianName">Parent/Guardian Name</Label>
              <FieldError errors={state.errors?.parentGuardianName} />
            </div>

            <div className="floating-field">
              <Input
                id="email"
                name="email"
                type="email"
                placeholder=" "
                className={cn("peer h-14 pt-6", fieldTone("email"))}
                aria-required="true"
              />
              <Label htmlFor="email">Email Address</Label>
              <FieldError errors={state.errors?.email} />
            </div>

            <div className="floating-field">
              <Input
                id="phoneWhatsapp"
                name="phoneWhatsapp"
                placeholder=" "
                className={cn("peer h-14 pt-6", fieldTone("phoneWhatsapp"))}
                aria-required="true"
              />
              <Label htmlFor="phoneWhatsapp">Phone / WhatsApp</Label>
              <FieldError errors={state.errors?.phoneWhatsapp} />
            </div>
          </section>

          <section className={cn(step === 2 ? "grid gap-5" : "hidden")} aria-hidden={step !== 2}>
            <div className="floating-field">
              <Input
                id="studentName"
                name="studentName"
                placeholder=" "
                className={cn("peer h-14 pt-6", fieldTone("studentName"))}
                aria-required="true"
              />
              <Label htmlFor="studentName">Student Name</Label>
              <FieldError errors={state.errors?.studentName} />
            </div>

            <div className="floating-field">
              <Input
                id="ageYearLevel"
                name="ageYearLevel"
                placeholder=" "
                className={cn("peer h-14 pt-6", fieldTone("ageYearLevel"))}
                aria-required="true"
              />
              <Label htmlFor="ageYearLevel">Age / Year Level</Label>
              <FieldError errors={state.errors?.ageYearLevel} />
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
                onChange={(event) => setCurriculumLevel(event.target.value)}
                data-has-value={curriculumLevel ? "true" : "false"}
                aria-label="Curriculum level"
              >
                <option value="">Select level</option>
                {levels.map((level) => (
                  <option key={level.key} value={level.key}>
                    {level.label}
                  </option>
                ))}
              </select>
              <Label htmlFor="curriculumLevel">Curriculum Level</Label>
              <FieldError errors={state.errors?.curriculumLevel} />
            </div>

            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium text-primary">Subject(s)</legend>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {subjectOptions.map((subject) => (
                  <label
                    key={subject}
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
                      value={subject}
                      className="h-4 w-4 rounded border-secondary"
                      aria-label={subject}
                    />
                    <span>{subject}</span>
                  </label>
                ))}
              </div>
              <FieldError errors={state.errors?.subjects} />
            </fieldset>
          </section>

          <section className={cn(step === 3 ? "grid gap-5" : "hidden")} aria-hidden={step !== 3}>
            <div className="floating-field">
              <Input
                id="preferredSchedule"
                name="preferredSchedule"
                placeholder=" "
                className={cn("peer h-14 pt-6", fieldTone("preferredSchedule"))}
                aria-required="true"
              />
              <Label htmlFor="preferredSchedule">Preferred Schedule</Label>
              <FieldError errors={state.errors?.preferredSchedule} />
            </div>

            <div className="floating-field">
              <Textarea
                id="additionalNotes"
                name="additionalNotes"
                placeholder=" "
                className={cn("peer min-h-[130px] pt-7", fieldTone("additionalNotes"))}
              />
              <Label htmlFor="additionalNotes" className="top-6">
                Additional Notes
              </Label>
              <FieldError errors={state.errors?.additionalNotes} />
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
                  onClick={() => setStep((value) => value + 1)}
                >
                  Next Step
                </Button>
              ) : null}
            </div>

            {step === 3 ? <SubmitButton /> : null}
          </div>

          {step === 3 ? <TurnstileWidget /> : null}

          {state.message ? (
            <output
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
