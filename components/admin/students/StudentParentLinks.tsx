"use client";

import {
  linkStudentParentAction,
  unlinkStudentParentAction,
} from "@/app/(admin)/admin/students/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ParentOption = {
  id: string;
  fullName: string;
  email: string | null;
};

type StudentParentLinksProps = {
  studentId: string;
  linkedParents: ParentOption[];
  availableParents: ParentOption[];
  flashMessage?: string;
  flashError?: string;
};

function ParentFlash({ message, error }: { message?: string; error?: string }) {
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

function formatParentLabel(parent: ParentOption) {
  return parent.fullName;
}

export function StudentParentLinks({
  studentId,
  linkedParents,
  availableParents,
  flashMessage,
  flashError,
}: StudentParentLinksProps) {
  const selectableParents = availableParents.filter(
    (parent) => !linkedParents.some((linkedParent) => linkedParent.id === parent.id),
  );
  const defaultParentId = selectableParents[0]?.id ?? "";
  const hasSelectableParents = selectableParents.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Parent links</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ParentFlash message={flashMessage} error={flashError} />

        {linkedParents.length === 0 ? (
          <output className="text-sm text-slate-600">No linked parents yet.</output>
        ) : (
          <ul className="space-y-3">
            {linkedParents.map((parent) => (
              <li
                key={parent.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2"
              >
                <div className="space-y-0.5">
                  <p className="font-medium text-slate-950">{parent.fullName}</p>
                  {parent.email ? <p className="text-sm text-slate-600">{parent.email}</p> : null}
                </div>

                <form action={unlinkStudentParentAction as unknown as (formData: FormData) => void}>
                  <input type="hidden" name="studentId" value={studentId} />
                  <input type="hidden" name="parentId" value={parent.id} />
                  <input type="hidden" name="flash" value="true" />
                  <input
                    type="hidden"
                    name="successRedirect"
                    value={`/admin/students/${studentId}/edit`}
                  />
                  <input
                    type="hidden"
                    name="errorRedirect"
                    value={`/admin/students/${studentId}/edit`}
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
          <h2 className="text-sm font-semibold text-slate-900">Add parent link</h2>

          <form
            action={linkStudentParentAction as unknown as (formData: FormData) => void}
            className="space-y-3"
          >
            <input type="hidden" name="studentId" value={studentId} />
            <input type="hidden" name="flash" value="true" />
            <input
              type="hidden"
              name="successRedirect"
              value={`/admin/students/${studentId}/edit`}
            />
            <input type="hidden" name="errorRedirect" value={`/admin/students/${studentId}/edit`} />

            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Parent
              <select
                name="parentId"
                defaultValue={defaultParentId}
                disabled={!hasSelectableParents}
                className="rounded-md border border-slate-300 bg-white px-3 py-2"
              >
                {hasSelectableParents ? (
                  selectableParents.map((parent) => (
                    <option key={parent.id} value={parent.id}>
                      {formatParentLabel(parent)}
                    </option>
                  ))
                ) : (
                  <option value="">No available parents</option>
                )}
              </select>
            </label>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Linked parents can be added or removed without changing the student account.
              </p>
              <Button type="submit" disabled={!hasSelectableParents}>
                Link Parent
              </Button>
            </div>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
