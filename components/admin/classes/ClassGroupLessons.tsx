import Link from "next/link";

import { deleteClassGroupLessonAction } from "@/app/(admin)/admin/classes/actions";
import { ConfirmedSubmit } from "@/components/admin/ConfirmedSubmit";
import { Button } from "@/components/ui/button";

type Lesson = {
  id: string;
  title: string;
  description?: string | null;
  startAt: Date | string;
  endAt: Date | string;
  liveLessonUrl: string | null;
  subject?: { id: string; name: string; slug: string } | null;
};

type ClassGroupLessonsProps = {
  classGroupId: string;
  upcomingLessons: Lesson[];
  pastLessons: Lesson[];
};

function formatDateTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function LessonList({
  classGroupId,
  lessons,
  label,
}: {
  classGroupId: string;
  lessons: Lesson[];
  label: string;
}) {
  return (
    <section className="space-y-3" aria-label={label}>
      <h3 className="text-lg font-semibold">{label}</h3>
      {lessons.length === 0 ? (
        <p className="text-sm text-muted-foreground">No lessons.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {lessons.map((lesson) => (
            <li key={lesson.id} className="space-y-3 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{lesson.title}</p>
                  {lesson.subject ? (
                    <p className="text-sm text-muted-foreground">Subject: {lesson.subject.name}</p>
                  ) : null}
                  <p className="text-sm text-muted-foreground">
                    {formatDateTime(lesson.startAt)} - {formatDateTime(lesson.endAt)}
                  </p>
                  {lesson.liveLessonUrl ? (
                    <a
                      href={lesson.liveLessonUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-primary underline-offset-4 hover:underline"
                    >
                      {lesson.liveLessonUrl}
                    </a>
                  ) : (
                    <p className="text-sm text-muted-foreground">Meeting link not set</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/admin/classes/${classGroupId}/lessons/${lesson.id}/edit`}>
                      Edit
                    </Link>
                  </Button>
                  <ConfirmedSubmit
                    title="Cancel lesson"
                    description={`Cancel ${lesson.title}? The lesson will be removed from active schedule views for enrolled users.`}
                    confirmLabel="Confirm cancellation"
                  >
                    <form
                      action={
                        deleteClassGroupLessonAction as unknown as (formData: FormData) => void
                      }
                    >
                      <input type="hidden" name="flash" value="true" />
                      <input type="hidden" name="classGroupId" value={classGroupId} />
                      <input type="hidden" name="lessonId" value={lesson.id} />
                      <input
                        type="hidden"
                        name="successRedirect"
                        value={`/admin/classes/${classGroupId}`}
                      />
                      <input
                        type="hidden"
                        name="errorRedirect"
                        value={`/admin/classes/${classGroupId}`}
                      />
                      <Button type="submit" variant="secondary" size="sm">
                        Cancel Lesson
                      </Button>
                    </form>
                  </ConfirmedSubmit>
                  <ConfirmedSubmit
                    title="Delete lesson"
                    description={`Delete ${lesson.title}? This will only succeed if no dependent lesson records block deletion.`}
                    confirmLabel="Confirm delete"
                  >
                    <form
                      action={
                        deleteClassGroupLessonAction as unknown as (formData: FormData) => void
                      }
                    >
                      <input type="hidden" name="flash" value="true" />
                      <input type="hidden" name="classGroupId" value={classGroupId} />
                      <input type="hidden" name="lessonId" value={lesson.id} />
                      <input
                        type="hidden"
                        name="successRedirect"
                        value={`/admin/classes/${classGroupId}`}
                      />
                      <input
                        type="hidden"
                        name="errorRedirect"
                        value={`/admin/classes/${classGroupId}`}
                      />
                      <Button type="submit" variant="destructive" size="sm">
                        Delete Lesson
                      </Button>
                    </form>
                  </ConfirmedSubmit>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ClassGroupLessons({
  classGroupId,
  upcomingLessons,
  pastLessons,
}: ClassGroupLessonsProps) {
  return (
    <section className="space-y-5" aria-label="Class group lessons">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Lessons</h2>
        <Button asChild>
          <Link href={`/admin/classes/${classGroupId}/lessons/new`}>Create Lesson</Link>
        </Button>
      </div>
      <LessonList classGroupId={classGroupId} lessons={upcomingLessons} label="Upcoming Lessons" />
      <LessonList classGroupId={classGroupId} lessons={pastLessons} label="Past Lessons" />
    </section>
  );
}
