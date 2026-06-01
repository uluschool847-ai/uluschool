"use client";

import {
  linkStudentClassAction,
  unlinkStudentClassAction,
} from "@/app/(admin)/admin/students/actions";
import { ConfirmedSubmit } from "@/components/admin/ConfirmedSubmit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type EnrolledClassOption = {
  id: string;
  title: string;
  startAt: Date;
  teacher: { id: string; fullName: string } | null;
};

type StudentClassEnrollmentsProps = {
  studentId: string;
  enrolledClasses: EnrolledClassOption[];
  availableClasses: EnrolledClassOption[];
  preferredClassId?: string;
  flashMessage?: string;
  flashError?: string;
};

function ClassFlash({ message, error }: { message?: string; error?: string }) {
  if (error) {
    return (
      <div
        className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        role="alert"
      >
        {error}
      </div>
    );
  }

  if (message) {
    return (
      <output className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        {message}
      </output>
    );
  }

  return null;
}

function formatClassStart(startAt: Date) {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(startAt);
}

export function StudentClassEnrollments({
  studentId,
  enrolledClasses,
  availableClasses,
  preferredClassId,
  flashMessage,
  flashError,
}: StudentClassEnrollmentsProps) {
  const selectableClasses = availableClasses.filter(
    (scheduledClass) =>
      !enrolledClasses.some((enrolledClass) => enrolledClass.id === scheduledClass.id),
  );
  const hasSelectableClasses = selectableClasses.length > 0;
  const defaultClassId =
    selectableClasses.find((scheduledClass) => scheduledClass.id === preferredClassId)?.id ??
    selectableClasses[0]?.id ??
    "";
  const enrollmentRedirect = `/admin/students/${studentId}/edit${
    preferredClassId ? `?classId=${encodeURIComponent(preferredClassId)}` : ""
  }`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Class enrollments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ClassFlash message={flashMessage} error={flashError} />

        {enrolledClasses.length === 0 ? (
          <output className="text-sm text-slate-600">No enrolled classes yet.</output>
        ) : (
          <ul className="space-y-3">
            {enrolledClasses.map((scheduledClass) => (
              <li
                key={scheduledClass.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2"
              >
                <div className="space-y-0.5">
                  <p className="font-medium text-slate-950">{scheduledClass.title}</p>
                  <p className="text-sm text-slate-600">
                    Start: {formatClassStart(scheduledClass.startAt)}
                  </p>
                  <p className="text-sm text-slate-600">
                    Teacher: {scheduledClass.teacher?.fullName ?? "TBA"}
                  </p>
                </div>

                <ConfirmedSubmit
                  title="Remove class enrollment"
                  description={`Remove this student from ${scheduledClass.title}? They will no longer see this class through the enrollment.`}
                  confirmLabel="Confirm removal"
                >
                  <form
                    action={unlinkStudentClassAction as unknown as (formData: FormData) => void}
                  >
                    <input type="hidden" name="studentId" value={studentId} />
                    <input type="hidden" name="classId" value={scheduledClass.id} />
                    <input type="hidden" name="flash" value="true" />
                    <input type="hidden" name="successRedirect" value={enrollmentRedirect} />
                    <input type="hidden" name="errorRedirect" value={enrollmentRedirect} />
                    <Button type="submit" variant="outline" size="sm">
                      Remove
                    </Button>
                  </form>
                </ConfirmedSubmit>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-sm font-semibold text-slate-900">Add class enrollment</h2>

          <form
            action={linkStudentClassAction as unknown as (formData: FormData) => void}
            className="space-y-3"
          >
            <input type="hidden" name="studentId" value={studentId} />
            <input type="hidden" name="flash" value="true" />
            <input type="hidden" name="successRedirect" value={enrollmentRedirect} />
            <input type="hidden" name="errorRedirect" value={enrollmentRedirect} />

            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Class
              <select
                name="classId"
                defaultValue={defaultClassId}
                disabled={!hasSelectableClasses}
                className="rounded-md border border-slate-300 bg-white px-3 py-2"
              >
                {hasSelectableClasses ? (
                  selectableClasses.map((scheduledClass) => (
                    <option key={scheduledClass.id} value={scheduledClass.id}>
                      {scheduledClass.title}
                    </option>
                  ))
                ) : (
                  <option value="">No available classes</option>
                )}
              </select>
            </label>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Class enrollments update the student registry and derived teacher display.
              </p>
              <Button type="submit" disabled={!hasSelectableClasses}>
                Enroll Class
              </Button>
            </div>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
