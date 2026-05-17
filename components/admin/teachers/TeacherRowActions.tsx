"use client";

import { useEffect, useRef, useState } from "react";

import {
  deleteTeacherAction,
  toggleTeacherStatusAction,
} from "@/app/(admin)/admin/teachers/actions";
import { Button } from "@/components/ui/button";

type TeacherRowActionsProps = {
  teacher: {
    id: string;
    isActive: boolean;
    fullName?: string;
  };
};

export function TeacherRowActions({ teacher }: TeacherRowActionsProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const deleteFormRef = useRef<HTMLFormElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (!isDeleteDialogOpen) {
      if (dialog.open && typeof dialog.close === "function") {
        dialog.close();
      }
      return;
    }

    if (typeof dialog.showModal === "function") {
      if (dialog.open) {
        dialog.removeAttribute("open");
      }

      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute("open", "");
      }
    } else {
      dialog.setAttribute("open", "");
    }

    const cancelButton = dialog.querySelector<HTMLButtonElement>(
      '[data-teacher-delete-cancel="true"]',
    );
    cancelButton?.focus();
  }, [isDeleteDialogOpen]);

  function openDeleteDialog() {
    setIsDeleteDialogOpen(true);
  }

  function closeDeleteDialog() {
    setIsDeleteDialogOpen(false);
    window.setTimeout(() => {
      deleteButtonRef.current?.focus();
    }, 0);
  }

  function confirmDelete() {
    deleteFormRef.current?.requestSubmit();
    setIsDeleteDialogOpen(false);
  }

  return (
    <div className="space-y-2 text-right">
      <form
        action={toggleTeacherStatusAction as unknown as (formData: FormData) => void}
        className="inline-block"
      >
        <input type="hidden" name="id" value={teacher.id} />
        <input type="hidden" name="isActive" value={teacher.isActive ? "false" : "true"} />
        <input type="hidden" name="flash" value="true" />
        <input type="hidden" name="successRedirect" value="/admin/teachers" />
        <input type="hidden" name="errorRedirect" value="/admin/teachers" />
        <Button type="submit" size="sm" variant="secondary">
          {teacher.isActive ? "Deactivate" : "Activate"}
        </Button>
      </form>

      <Button
        ref={deleteButtonRef}
        type="button"
        size="sm"
        variant="destructive"
        onClick={openDeleteDialog}
      >
        Delete
      </Button>

      <form
        action={deleteTeacherAction as unknown as (formData: FormData) => void}
        ref={deleteFormRef}
        className="hidden"
      >
        <input type="hidden" name="id" value={teacher.id} />
        <input type="hidden" name="flash" value="true" />
        <input type="hidden" name="successRedirect" value="/admin/teachers" />
        <input type="hidden" name="errorRedirect" value="/admin/teachers" />
      </form>

      {isDeleteDialogOpen ? (
        <dialog
          ref={dialogRef}
          aria-describedby="teacher-delete-dialog-description"
          aria-labelledby="teacher-delete-dialog-title"
          aria-modal="true"
          onCancel={(event) => {
            event.preventDefault();
            closeDeleteDialog();
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeDeleteDialog();
            }
          }}
          onKeyDown={(event) => {
            if (
              event.target === event.currentTarget &&
              (event.key === "Enter" || event.key === " ")
            ) {
              event.preventDefault();
              closeDeleteDialog();
            }
          }}
          className="fixed inset-0 z-50 flex max-h-none w-full max-w-none items-center justify-center border-0 bg-slate-950/50 px-4 p-0"
        >
          <div className="w-full max-w-md rounded-xl border border-secondary bg-white p-6 shadow-xl">
            <h2 id="teacher-delete-dialog-title" className="text-lg font-semibold text-slate-950">
              Confirm teacher deletion
            </h2>
            <p id="teacher-delete-dialog-description" className="mt-2 text-sm text-slate-600">
              {teacher.fullName
                ? `Delete ${teacher.fullName}? This action permanently removes the teacher profile.`
                : "Delete this teacher profile? This action permanently removes the profile."}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                data-teacher-delete-cancel="true"
                onClick={closeDeleteDialog}
              >
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={confirmDelete}>
                Confirm delete
              </Button>
            </div>
          </div>
        </dialog>
      ) : null}
    </div>
  );
}
