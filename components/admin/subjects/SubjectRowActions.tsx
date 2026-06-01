"use client";

import Link from "next/link";

import { deleteSubjectAction, setSubjectActiveAction } from "@/app/(admin)/admin/subjects/actions";
import { ConfirmedSubmit } from "@/components/admin/ConfirmedSubmit";
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
  const nextActiveState = !subject.isActive;
  const statusForm = (
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
  );

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button asChild size="sm" variant="outline">
        <Link href={`/admin/subjects/${subject.id}/edit`}>Edit</Link>
      </Button>

      {subject.isActive ? (
        <ConfirmedSubmit
          title="Deactivate subject"
          description={`Deactivate ${subject.name}? The subject will be hidden from active subject selectors until it is activated again.`}
          confirmLabel="Confirm deactivation"
        >
          {statusForm}
        </ConfirmedSubmit>
      ) : (
        statusForm
      )}

      <ConfirmedSubmit
        title="Delete subject"
        description={`Delete ${subject.name} (${subject.slug})? This will only succeed if no academic records depend on it. Dependencies will block deletion.`}
        confirmLabel="Confirm delete"
      >
        <form action={deleteSubjectAction as unknown as (formData: FormData) => void}>
          <input type="hidden" name="id" value={subject.id} />
          <input type="hidden" name="flash" value="true" />
          <input type="hidden" name="successRedirect" value="/admin/subjects" />
          <input type="hidden" name="errorRedirect" value="/admin/subjects" />
          <Button type="submit" size="sm" variant="destructive">
            Delete
          </Button>
        </form>
      </ConfirmedSubmit>
    </div>
  );
}
