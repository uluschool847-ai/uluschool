import { LessonStatus } from "@prisma/client";

type MeetingProviderInput = "GOOGLE_MEET" | "MANUAL_URL" | string | null | undefined;

type LiveLessonUrlValidation =
  | { ok: true; url: string }
  | { ok: true; url: null; missing: true; reason: string }
  | { ok: false; reason: string };

type JoinButtonState =
  | { enabled: true; href: string; reason: null }
  | { enabled: false; href: null; reason: string };

export const MISSING_MEETING_LINK_REASON = "Meeting link not available yet";
export const REMINDER_MEETING_LINK_PLACEHOLDER = "Meeting link will be shared before the lesson";

export function normalizeLiveLessonUrl(url: string | null | undefined): string | null {
  const normalized = url?.trim() ?? "";

  return normalized.length > 0 ? normalized : null;
}

export function isGoogleMeetUrl(url: string | null | undefined): boolean {
  const normalized = normalizeLiveLessonUrl(url);

  if (!normalized) {
    return false;
  }

  try {
    const parsed = new URL(normalized);

    return (
      parsed.protocol === "https:" &&
      parsed.hostname.toLowerCase() === "meet.google.com" &&
      parsed.pathname.length > 1
    );
  } catch {
    return false;
  }
}

export function validateLiveLessonUrl(
  url: string | null | undefined,
  provider: MeetingProviderInput,
  options: { required?: boolean } = {},
): LiveLessonUrlValidation {
  const normalized = normalizeLiveLessonUrl(url);
  const required = options.required ?? true;

  if (!normalized) {
    if (!required) {
      return { ok: true, url: null, missing: true, reason: MISSING_MEETING_LINK_REASON };
    }

    return { ok: false, reason: "Meeting link is required" };
  }

  let parsed: URL;

  try {
    parsed = new URL(normalized);
  } catch {
    return { ok: false, reason: "Meeting link must be a valid HTTPS URL" };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "Meeting link must use a safe HTTPS URL" };
  }

  if ((provider ?? "GOOGLE_MEET") === "GOOGLE_MEET" && !isGoogleMeetUrl(normalized)) {
    return { ok: false, reason: "Google Meet lessons must use a meet.google.com URL" };
  }

  return { ok: true, url: normalized };
}

export function canShowJoinButton(
  lesson: {
    status?: LessonStatus | string | null;
    startAt: Date | string;
    endAt: Date | string;
    liveLessonUrl?: string | null;
    meetingProvider?: MeetingProviderInput;
  },
  now: Date,
): JoinButtonState {
  if (lesson.status === LessonStatus.CANCELLED || lesson.status === "CANCELLED") {
    return { enabled: false, href: null, reason: "Lesson cancelled" };
  }

  if (lesson.status === LessonStatus.COMPLETED || lesson.status === "COMPLETED") {
    return { enabled: false, href: null, reason: "Lesson completed" };
  }

  const validation = validateLiveLessonUrl(
    lesson.liveLessonUrl,
    lesson.meetingProvider ?? "MANUAL_URL",
    {
      required: false,
    },
  );

  if (!validation.ok) {
    return { enabled: false, href: null, reason: "Invalid meeting link" };
  }

  if (validation.url === null) {
    return { enabled: false, href: null, reason: MISSING_MEETING_LINK_REASON };
  }

  const startAt = lesson.startAt instanceof Date ? lesson.startAt : new Date(lesson.startAt);
  const endAt = lesson.endAt instanceof Date ? lesson.endAt : new Date(lesson.endAt);
  const openAt = startAt.getTime() - 15 * 60 * 1000;
  const closeAt = endAt.getTime() + 15 * 60 * 1000;
  const nowTime = now.getTime();

  if (nowTime < openAt) {
    return { enabled: false, href: null, reason: "Available before lesson" };
  }

  if (nowTime > closeAt) {
    return { enabled: false, href: null, reason: "Lesson completed" };
  }

  return { enabled: true, href: validation.url, reason: null };
}
