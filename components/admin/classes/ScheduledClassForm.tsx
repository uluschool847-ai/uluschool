import Link from "next/link";

import {
  createScheduledClassAction,
  updateScheduledClassAction,
} from "@/app/(admin)/admin/actions/academic-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TeacherOption = {
  id: string;
  fullName: string;
  email: string;
  isActive?: boolean;
};

type SubjectOption = {
  id: string;
  name: string;
  slug: string;
  isActive?: boolean;
};

type ScheduledClassFormProps = {
  mode: "create" | "edit";
  teachers: TeacherOption[];
  subjects?: SubjectOption[];
  scheduledClass?: {
    id: string;
    title: string;
    description: string | null;
    startAt: Date;
    endAt: Date;
    liveLessonUrl: string;
    meetingProvider?: string | null;
    subjectId?: string | null;
    subject?: SubjectOption | null;
    teacherId: string | null;
    teacher?: TeacherOption | null;
  };
  flashMessage?: string;
  flashError?: string;
  successRedirect?: string;
  errorRedirect?: string;
};

function ClassFlash({ message, error }: { message?: string; error?: string }) {
  if (!error && !message) return null;

  return (
    <div className="space-y-2">
      {error ? (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      ) : null}
      {message ? (
        <output className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </output>
      ) : null}
    </div>
  );
}

function toDateTimeLocalValue(date?: Date | null) {
  if (!date) return "";
  const localDate = new Date(date);
  localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
  return localDate.toISOString().slice(0, 16);
}

function uniqueTeacherOptions(teachers: TeacherOption[], currentTeacher?: TeacherOption | null) {
  const options = currentTeacher ? [currentTeacher, ...teachers] : teachers;
  const seen = new Set<string>();
  return options.filter((teacher) => {
    if (seen.has(teacher.id)) return false;
    seen.add(teacher.id);
    return true;
  });
}

function uniqueSubjectOptions(subjects: SubjectOption[], currentSubject?: SubjectOption | null) {
  const options = currentSubject ? [currentSubject, ...subjects] : subjects;
  const seen = new Set<string>();
  return options.filter((subject) => {
    if (seen.has(subject.id)) return false;
    seen.add(subject.id);
    return true;
  });
}

export function ScheduledClassForm({
  mode,
  teachers,
  subjects = [],
  scheduledClass,
  flashMessage,
  flashError,
  successRedirect = "/admin/classes",
  errorRedirect,
}: ScheduledClassFormProps) {
  const isNew = mode === "create";
  const formAction = isNew
    ? createScheduledClassAction
    : updateScheduledClassAction.bind(null, scheduledClass?.id ?? "");
  const teacherOptions = uniqueTeacherOptions(teachers, scheduledClass?.teacher ?? null);
  const subjectOptions = uniqueSubjectOptions(subjects, scheduledClass?.subject ?? null);
  const selectedSubjectId = scheduledClass?.subjectId ?? "";
  const resolvedErrorRedirect =
    errorRedirect ??
    (scheduledClass ? `/admin/classes/${scheduledClass.id}/edit` : "/admin/classes/new");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Class Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ClassFlash message={flashMessage} error={flashError} />

        <form
          action={formAction as unknown as (formData: FormData) => void}
          className="space-y-6"
          noValidate
        >
          <input type="hidden" name="flash" value="true" />
          <input type="hidden" name="successRedirect" value={successRedirect} />
          <input type="hidden" name="errorRedirect" value={resolvedErrorRedirect} />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required defaultValue={scheduledClass?.title ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="teacherId">Teacher</Label>
              <select
                id="teacherId"
                name="teacherId"
                required
                defaultValue={scheduledClass?.teacherId ?? ""}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select teacher</option>
                {teacherOptions.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.fullName}
                    {teacher.isActive === false ? " (inactive)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="subjectId">Subject</Label>
              <input
                aria-hidden="true"
                className="sr-only"
                readOnly
                tabIndex={-1}
                value={selectedSubjectId}
              />
              <select
                id="subjectId"
                name="subjectId"
                defaultValue={selectedSubjectId}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">No subject</option>
                {subjectOptions.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                    {subject.isActive === false ? " (inactive)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              defaultValue={scheduledClass?.description ?? ""}
              className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="startAt">Start time</Label>
              <Input
                id="startAt"
                name="startAt"
                type="datetime-local"
                required
                defaultValue={toDateTimeLocalValue(scheduledClass?.startAt)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endAt">End time / duration</Label>
              <Input
                id="endAt"
                name="endAt"
                type="datetime-local"
                required
                defaultValue={toDateTimeLocalValue(scheduledClass?.endAt)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="liveLessonUrl">Live lesson URL</Label>
            <input
              type="hidden"
              name="meetingProvider"
              value={scheduledClass?.meetingProvider ?? "GOOGLE_MEET"}
            />
            <Input
              id="liveLessonUrl"
              name="liveLessonUrl"
              type="url"
              required
              defaultValue={scheduledClass?.liveLessonUrl ?? ""}
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button asChild variant="outline">
              <Link href="/admin/classes">Cancel</Link>
            </Button>
            <Button type="submit">{isNew ? "Create Class" : "Save Class"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
