import { validateLiveLessonUrl } from "@/lib/lessons/live-lesson-url";

export type TeacherStartLessonProvider = "GOOGLE_MEET" | "MANUAL_URL";
export const LEGACY_TEACHER_START_PROVIDER: TeacherStartLessonProvider = "MANUAL_URL";

export type StartLessonButtonProps = {
  startState: {
    enabled: boolean;
    href: string | null;
    reason: string | null;
  };
  provider: TeacherStartLessonProvider;
};

export function normalizeTeacherStartLessonProvider(
  provider: TeacherStartLessonProvider | string | null | undefined,
): TeacherStartLessonProvider {
  return provider === "MANUAL_URL" ? "MANUAL_URL" : "GOOGLE_MEET";
}

export function TeacherStartLessonButton({ startState, provider }: StartLessonButtonProps) {
  if (startState.enabled && startState.href) {
    const validation = validateLiveLessonUrl(startState.href, provider, { required: false });

    if (validation.ok && validation.url) {
      return (
        <a
          href={validation.url}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border px-3 py-2 text-sm font-medium"
        >
          Start Lesson
        </a>
      );
    }

    return <DisabledStartLessonButton reason="Invalid meeting link" />;
  }

  return <DisabledStartLessonButton reason={startState.reason ?? "Meeting link missing"} />;
}

function DisabledStartLessonButton({ reason }: { reason: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" disabled className="rounded-md border px-3 py-2 text-sm font-medium">
        Start Lesson
      </button>
      <span className="text-sm">{reason}</span>
    </span>
  );
}
