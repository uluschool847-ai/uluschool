"use client";

import Link from "next/link";
import { useState } from "react";

import {
  cancelLessonAction,
  completeLessonAction,
  deleteLessonAction,
} from "@/app/(admin)/admin/lessons/actions";
import { Button } from "@/components/ui/button";
import { validateLiveLessonUrl } from "@/lib/lessons/live-lesson-url";

type LessonRowActionsProps = {
  lesson: {
    id: string;
    classGroupId: string;
    title: string;
    status: string;
    startAt?: Date;
    endAt?: Date;
    liveLessonUrl: string | null;
  };
  showStatus?: boolean;
};

export function LessonRowActions({ lesson, showStatus = true }: LessonRowActionsProps) {
  const [showCancel, setShowCancel] = useState(false);
  const liveLessonUrlValidation = validateLiveLessonUrl(lesson.liveLessonUrl, "MANUAL_URL", {
    required: false,
  });
  const safeLiveLessonUrl =
    liveLessonUrlValidation.ok && liveLessonUrlValidation.url ? liveLessonUrlValidation.url : null;
  const canJoin =
    lesson.status !== "CANCELLED" && lesson.status !== "COMPLETED" && Boolean(safeLiveLessonUrl);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {showStatus ? (
          <span className="text-xs font-semibold uppercase">{lesson.status}</span>
        ) : null}
        <Button asChild variant="secondary" size="sm">
          <Link href={`/admin/classes/${lesson.classGroupId}/lessons/${lesson.id}/edit`}>Edit</Link>
        </Button>
        <Button type="button" variant="secondary" size="sm">
          Reschedule
        </Button>
        <form action={completeLessonAction as unknown as (formData: FormData) => void}>
          <input type="hidden" name="id" value={lesson.id} />
          <input type="hidden" name="classGroupId" value={lesson.classGroupId} />
          <input type="hidden" name="flash" value="true" />
          <input
            type="hidden"
            name="successRedirect"
            value={`/admin/classes/${lesson.classGroupId}`}
          />
          <input
            type="hidden"
            name="errorRedirect"
            value={`/admin/classes/${lesson.classGroupId}/lessons/${lesson.id}`}
          />
          <Button type="submit" variant="secondary" size="sm">
            Complete
          </Button>
        </form>
        <Button type="button" variant="secondary" size="sm" onClick={() => setShowCancel(true)}>
          Cancel
        </Button>
        <form action={deleteLessonAction as unknown as (formData: FormData) => void}>
          <input type="hidden" name="id" value={lesson.id} />
          <input type="hidden" name="classGroupId" value={lesson.classGroupId} />
          <input type="hidden" name="flash" value="true" />
          <input
            type="hidden"
            name="successRedirect"
            value={`/admin/classes/${lesson.classGroupId}`}
          />
          <input
            type="hidden"
            name="errorRedirect"
            value={`/admin/classes/${lesson.classGroupId}/lessons/${lesson.id}`}
          />
          <Button type="submit" variant="destructive" size="sm">
            Delete
          </Button>
        </form>
        {canJoin ? (
          <Button asChild size="sm">
            <a href={safeLiveLessonUrl ?? ""} target="_blank" rel="noreferrer">
              Start Lesson
            </a>
          </Button>
        ) : null}
      </div>
      {showCancel ? (
        <form
          action={cancelLessonAction as unknown as (formData: FormData) => void}
          className="flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="id" value={lesson.id} />
          <input type="hidden" name="classGroupId" value={lesson.classGroupId} />
          <input type="hidden" name="flash" value="true" />
          <input
            type="hidden"
            name="successRedirect"
            value={`/admin/classes/${lesson.classGroupId}`}
          />
          <input
            type="hidden"
            name="errorRedirect"
            value={`/admin/classes/${lesson.classGroupId}/lessons/${lesson.id}`}
          />
          <label className="block space-y-1 text-sm font-medium">
            <span>Cancel reason</span>
            <input
              name="cancelReason"
              required
              className="h-11 rounded-md border border-input bg-background px-3"
            />
          </label>
          <Button type="submit" variant="destructive" size="sm">
            Confirm Cancel
          </Button>
        </form>
      ) : null}
    </div>
  );
}
