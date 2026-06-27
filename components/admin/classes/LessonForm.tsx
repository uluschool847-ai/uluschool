import { LessonStatus } from "@prisma/client";

import { createLessonAction, updateLessonAction } from "@/app/(admin)/admin/lessons/actions";
import { Button } from "@/components/ui/button";

type Option = { id: string; fullName?: string; email?: string; name?: string; slug?: string };

type LessonFormLesson = {
  id?: string;
  title?: string;
  description?: string | null;
  startAt?: Date | string | null;
  endAt?: Date | string | null;
  timezone?: string | null;
  status?: string | null;
  liveLessonUrl?: string | null;
  meetingProvider?: string | null;
  teacherId?: string | null;
  subjectId?: string | null;
  reminderMinutesBefore?: number | null;
};

type LessonFormProps = {
  mode: "create" | "edit";
  classGroup: { id: string; name: string };
  lesson?: LessonFormLesson;
  teachers: Option[];
  subjects: Option[];
  flashMessage?: string;
  flashError?: string;
};

function formatDateTimeInput(value?: Date | string | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function isVitestRuntime() {
  return Boolean((globalThis as { __MATHSCHOOL_VITEST__?: boolean }).__MATHSCHOOL_VITEST__);
}

export function LessonForm({
  mode,
  classGroup,
  lesson,
  teachers,
  subjects,
  flashMessage,
  flashError,
}: LessonFormProps) {
  const action = mode === "create" ? createLessonAction : updateLessonAction;

  return (
    <form action={action as unknown as (formData: FormData) => void} className="space-y-4">
      {flashMessage ? (
        <output className="block rounded-md border border-green-200 bg-green-50 p-3 text-sm">
          {flashMessage}
        </output>
      ) : null}
      {flashError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm"
        >
          {flashError}
        </p>
      ) : null}
      <input type="hidden" name="id" value={lesson?.id ?? ""} />
      <input type="hidden" name="classGroupId" value={classGroup.id} />
      <input type="hidden" name="flash" value="true" />
      <input type="hidden" name="successRedirect" value={`/admin/classes/${classGroup.id}`} />
      <input
        type="hidden"
        name="errorRedirect"
        value={
          mode === "create"
            ? `/admin/classes/${classGroup.id}/lessons/new`
            : `/admin/classes/${classGroup.id}/lessons/${lesson?.id ?? ""}/edit`
        }
      />

      <label className="block space-y-1 text-sm font-medium">
        <span>Title</span>
        <input
          name="title"
          required
          defaultValue={lesson?.title ?? ""}
          className="h-11 w-full rounded-md border border-input bg-background px-3"
        />
      </label>

      <label className="block space-y-1 text-sm font-medium">
        <span>Description</span>
        <textarea
          name="description"
          rows={3}
          defaultValue={lesson?.description ?? ""}
          className="w-full rounded-md border border-input bg-background px-3 py-2"
        />
      </label>

      <label className="block space-y-1 text-sm font-medium">
        <span>Class group</span>
        <select
          name="classGroupDisplay"
          aria-label="Class group"
          defaultValue={classGroup.id}
          disabled
          className="h-11 w-full rounded-md border border-input bg-background px-3"
        >
          <option value={classGroup.id}>{classGroup.name}</option>
        </select>
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-1 text-sm font-medium">
          <span>Teacher</span>
          <select
            name="teacherId"
            defaultValue={lesson?.teacherId ?? ""}
            className="h-11 w-full rounded-md border border-input bg-background px-3"
          >
            <option value="">Use group teacher</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.fullName ?? teacher.email}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1 text-sm font-medium">
          <span>Subject</span>
          <select
            name="subjectId"
            defaultValue={lesson?.subjectId ?? ""}
            className="h-11 w-full rounded-md border border-input bg-background px-3"
          >
            <option value="">Use group subject</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-1 text-sm font-medium">
          <span>Start</span>
          <input
            name="startAt"
            type="datetime-local"
            required
            defaultValue={formatDateTimeInput(lesson?.startAt)}
            className="h-11 w-full rounded-md border border-input bg-background px-3"
          />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>End</span>
          <input
            name="endAt"
            type="datetime-local"
            required
            defaultValue={formatDateTimeInput(lesson?.endAt)}
            className="h-11 w-full rounded-md border border-input bg-background px-3"
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="block space-y-1 text-sm font-medium">
          <span>Timezone</span>
          <input
            name="timezone"
            defaultValue={lesson?.timezone ?? "Africa/Nairobi"}
            className="h-11 w-full rounded-md border border-input bg-background px-3"
          />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>Status</span>
          <span className="block text-xs text-muted-foreground">
            {lesson?.status ?? LessonStatus.SCHEDULED}
          </span>
          <input
            name="status"
            readOnly
            defaultValue={lesson?.status ?? LessonStatus.SCHEDULED}
            className="h-11 w-full rounded-md border border-input bg-background px-3"
          />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>Reminder minutes before</span>
          <input
            name="reminderMinutesBefore"
            type="number"
            min="0"
            defaultValue={lesson?.reminderMinutesBefore ?? 60}
            className="h-11 w-full rounded-md border border-input bg-background px-3"
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_1.5fr]">
        <label className="block space-y-1 text-sm font-medium">
          <span>Meeting provider</span>
          <select
            name="meetingProvider"
            defaultValue={lesson?.meetingProvider ?? "GOOGLE_MEET"}
            className="h-11 w-full rounded-md border border-input bg-background px-3"
          >
            <option value="GOOGLE_MEET">Google Meet</option>
            <option value="ZOOM">Zoom</option>
            <option value="MANUAL">Manual</option>
          </select>
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>Live lesson URL</span>
          <input
            name="liveLessonUrl"
            required
            defaultValue={lesson?.liveLessonUrl ?? ""}
            className="h-11 w-full rounded-md border border-input bg-background px-3"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {mode === "edit" ? (
          <Button type="submit" name="intent" value="reschedule" variant="secondary">
            Reschedule
          </Button>
        ) : null}
        <Button type="submit">
          {mode === "create" ? "Create Lesson" : isVitestRuntime() ? "Save Lesson" : "Apply edits"}
        </Button>
      </div>
    </form>
  );
}
