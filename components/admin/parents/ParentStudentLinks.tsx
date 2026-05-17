"use client";

import {
  linkParentStudentAction,
  unlinkParentStudentAction,
} from "@/app/(admin)/admin/parents/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type StudentOption = {
  id: string;
  fullName: string;
  email: string | null;
  isActive?: boolean;
};

type ParentStudentLinksProps = {
  parentId: string;
  linkedStudents: StudentOption[];
  availableStudents: StudentOption[];
  flashMessage?: string;
  flashError?: string;
};

function StudentLinkFlash({ message, error }: { message?: string; error?: string }) {
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

function formatStudentLabel(student: StudentOption) {
  return student.fullName;
}

export function ParentStudentLinks({
  parentId,
  linkedStudents,
  availableStudents,
  flashMessage,
  flashError,
}: ParentStudentLinksProps) {
  const selectableStudents = availableStudents.filter(
    (student) => !linkedStudents.some((linkedStudent) => linkedStudent.id === student.id),
  );
  const defaultStudentId = selectableStudents[0]?.id ?? "";
  const hasSelectableStudents = selectableStudents.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Linked students</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <StudentLinkFlash message={flashMessage} error={flashError} />

        {linkedStudents.length === 0 ? (
          <output className="text-sm text-slate-600">No linked students yet.</output>
        ) : (
          <ul className="space-y-3">
            {linkedStudents.map((student) => (
              <li
                key={student.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2"
              >
                <div className="space-y-0.5">
                  <p className="font-medium text-slate-950">{student.fullName}</p>
                  {student.email ? <p className="text-sm text-slate-600">{student.email}</p> : null}
                  {student.isActive === false ? (
                    <p className="text-xs font-medium text-amber-700">Disabled account</p>
                  ) : null}
                </div>

                <form action={unlinkParentStudentAction as unknown as (formData: FormData) => void}>
                  <input type="hidden" name="parentId" value={parentId} />
                  <input type="hidden" name="studentId" value={student.id} />
                  <input type="hidden" name="flash" value="true" />
                  <input
                    type="hidden"
                    name="successRedirect"
                    value={`/admin/parents/${parentId}/edit`}
                  />
                  <input
                    type="hidden"
                    name="errorRedirect"
                    value={`/admin/parents/${parentId}/edit`}
                  />
                  <Button type="submit" variant="outline" size="sm">
                    Remove
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-sm font-semibold text-slate-900">Add student link</h2>

          <form
            action={linkParentStudentAction as unknown as (formData: FormData) => void}
            className="space-y-3"
          >
            <input type="hidden" name="parentId" value={parentId} />
            <input type="hidden" name="flash" value="true" />
            <input type="hidden" name="successRedirect" value={`/admin/parents/${parentId}/edit`} />
            <input type="hidden" name="errorRedirect" value={`/admin/parents/${parentId}/edit`} />

            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Student
              <select
                name="studentId"
                defaultValue={defaultStudentId}
                disabled={!hasSelectableStudents}
                className="rounded-md border border-slate-300 bg-white px-3 py-2"
              >
                {hasSelectableStudents ? (
                  selectableStudents.map((student) => (
                    <option key={student.id} value={student.id}>
                      {formatStudentLabel(student)}
                    </option>
                  ))
                ) : (
                  <option value="">No available students</option>
                )}
              </select>
            </label>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Linked students can be added or removed without changing the parent account.
              </p>
              <Button type="submit" disabled={!hasSelectableStudents}>
                Link Student
              </Button>
            </div>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
