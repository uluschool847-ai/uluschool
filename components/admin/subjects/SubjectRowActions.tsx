"use client";

import Link from "next/link";
import { useState } from "react";

import { deleteSubjectAction, setSubjectActiveAction } from "@/app/(admin)/admin/subjects/actions";
import { Button } from "@/components/ui/button";

type SubjectRowActionsProps = {
  subject: {
    id: string;
    slug: string;
    name: string;
    isActive: boolean;
    teachersCount?: number;
  };
};

export function SubjectRowActions({ subject }: SubjectRowActionsProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const nextActiveState = !subject.isActive;

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button asChild size="sm" variant="outline">
        <Link href={`/admin/subjects/${subject.id}/edit`}>Edit</Link>
      </Button>

      <form action={setSubjectActiveAction as unknown as (formData: FormData) => void}>
        <input type="hidden" name="id" value={subject.id} />
        <input type="hidden" name="isActive" value={String(nextActiveState)} />
        <input type="hidden" name="flash" value="true" />
        <input type="hidden" name="successRedirect" value="/admin/subjects" />
        <input type="hidden" name="errorRedirect" value="/admin/subjects" />
        <Button type="submit" size="sm" variant="secondary">
          {nextActiveState ? "Activate" : "Deactivate"}
        </Button>
      </form>

      <form action={deleteSubjectAction as unknown as (formData: FormData) => void}>
        <input type="hidden" name="id" value={subject.id} />
        <input type="hidden" name="flash" value="true" />
        <input type="hidden" name="successRedirect" value="/admin/subjects" />
        <input type="hidden" name="errorRedirect" value="/admin/subjects" />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          onClick={() => setConfirmingDelete(true)}
        >
          Delete
        </Button>
      </form>

      {confirmingDelete ? (
        <dialog
          open
          aria-modal="true"
          aria-label={`Confirm delete ${subject.name}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
        >
          <div className="w-full max-w-md rounded-md bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-slate-950">Delete subject</h2>
            <p className="mt-2 text-sm text-slate-600">
              Confirm deletion for slug {subject.slug}. This will only succeed if no academic
              records depend on it. Dependencies will block deletion.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </Button>
              <form action={deleteSubjectAction as unknown as (formData: FormData) => void}>
                <input type="hidden" name="id" value={subject.id} />
                <input type="hidden" name="flash" value="true" />
                <input type="hidden" name="successRedirect" value="/admin/subjects" />
                <input type="hidden" name="errorRedirect" value="/admin/subjects" />
                <Button type="submit" size="sm" variant="secondary">
                  Confirm Delete
                </Button>
              </form>
            </div>
          </div>
        </dialog>
      ) : null}
    </div>
  );
}
