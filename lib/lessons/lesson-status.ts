import { LessonStatus } from "@prisma/client";

import { validateLiveLessonUrl } from "@/lib/lessons/live-lesson-url";

const LESSON_WINDOW_MS = 15 * 60 * 1000;

export const LESSON_STATUS_LABELS: Record<LessonStatus, string> = {
  [LessonStatus.SCHEDULED]: "Scheduled",
  [LessonStatus.LIVE]: "Live",
  [LessonStatus.COMPLETED]: "Completed",
  [LessonStatus.CANCELLED]: "Cancelled",
  [LessonStatus.RESCHEDULED]: "Rescheduled",
};

export const LESSON_STATUS_DESCRIPTIONS: Record<LessonStatus, string> = {
  [LessonStatus.SCHEDULED]: "Lesson is scheduled and has not started.",
  [LessonStatus.LIVE]: "Lesson is currently live.",
  [LessonStatus.COMPLETED]: "Lesson has been completed.",
  [LessonStatus.CANCELLED]: "Lesson has been cancelled.",
  [LessonStatus.RESCHEDULED]: "Lesson has been rescheduled.",
};

export const LESSON_STATUS_BADGE_VARIANTS: Record<LessonStatus, string> = {
  [LessonStatus.SCHEDULED]: "secondary",
  [LessonStatus.LIVE]: "default",
  [LessonStatus.COMPLETED]: "outline",
  [LessonStatus.CANCELLED]: "destructive",
  [LessonStatus.RESCHEDULED]: "secondary",
};

const LESSON_STATUS_VALUES = new Set<string>(Object.values(LessonStatus));
const TERMINAL_LESSON_STATUSES = new Set<LessonStatus>([
  LessonStatus.CANCELLED,
  LessonStatus.COMPLETED,
]);

type LessonLike = {
  status: LessonStatus | string;
  startAt: Date;
  endAt: Date;
  liveLessonUrl?: string | null;
  meetingProvider?: string | null;
  rescheduledFromId?: string | null;
};

export type RuntimeLessonStatus = {
  lifecycleStatus: LessonStatus | string;
  displayStatus: LessonStatus | string;
  isRescheduled: boolean;
  rescheduledFromId: string | null;
};

export type LessonActionAvailability = {
  enabled: boolean;
  href: string | null;
  reason: string | null;
};

export function parseLessonStatus(input: unknown): LessonStatus | null {
  return typeof input === "string" && LESSON_STATUS_VALUES.has(input)
    ? (input as LessonStatus)
    : null;
}

export function isTerminalLessonStatus(status: LessonStatus) {
  return TERMINAL_LESSON_STATUSES.has(status);
}

export function isActiveLessonStatus(status: LessonStatus) {
  return !isTerminalLessonStatus(status);
}

export function deriveLessonRuntimeStatus(lesson: LessonLike, now: Date): RuntimeLessonStatus {
  if (lesson.status === LessonStatus.CANCELLED || lesson.status === "CANCELLED") {
    return {
      lifecycleStatus: lesson.status,
      displayStatus: LessonStatus.CANCELLED,
      isRescheduled: false,
      rescheduledFromId: lesson.rescheduledFromId ?? null,
    };
  }

  if (lesson.status === LessonStatus.COMPLETED || lesson.status === "COMPLETED") {
    return {
      lifecycleStatus: lesson.status,
      displayStatus: LessonStatus.COMPLETED,
      isRescheduled: false,
      rescheduledFromId: lesson.rescheduledFromId ?? null,
    };
  }

  if (lesson.status === LessonStatus.RESCHEDULED || lesson.status === "RESCHEDULED") {
    return {
      lifecycleStatus: lesson.status,
      displayStatus: LessonStatus.RESCHEDULED,
      isRescheduled: true,
      rescheduledFromId: lesson.rescheduledFromId ?? null,
    };
  }

  const current = now.getTime();
  const opensAt = lesson.startAt.getTime() - LESSON_WINDOW_MS;
  const closesAt = lesson.endAt.getTime() + LESSON_WINDOW_MS;

  if (current >= opensAt && current <= closesAt) {
    return {
      lifecycleStatus: lesson.status,
      displayStatus: LessonStatus.LIVE,
      isRescheduled: false,
      rescheduledFromId: lesson.rescheduledFromId ?? null,
    };
  }

  if (current > closesAt) {
    return {
      lifecycleStatus: lesson.status,
      displayStatus: LessonStatus.COMPLETED,
      isRescheduled: false,
      rescheduledFromId: lesson.rescheduledFromId ?? null,
    };
  }

  return {
    lifecycleStatus: lesson.status,
    displayStatus: LessonStatus.SCHEDULED,
    isRescheduled: false,
    rescheduledFromId: lesson.rescheduledFromId ?? null,
  };
}

function canUseLessonLink(
  lesson: LessonLike,
  now: Date,
  missingUrlReason: string,
): LessonActionAvailability {
  if (lesson.status === LessonStatus.CANCELLED || lesson.status === "CANCELLED") {
    return { enabled: false, href: null, reason: "Lesson is cancelled" };
  }
  if (lesson.status === LessonStatus.COMPLETED || lesson.status === "COMPLETED") {
    return { enabled: false, href: null, reason: "Lesson is completed" };
  }
  if (!lesson.liveLessonUrl) {
    return { enabled: false, href: null, reason: missingUrlReason };
  }

  const validation = validateLiveLessonUrl(
    lesson.liveLessonUrl,
    lesson.meetingProvider ?? "MANUAL_URL",
    {
      required: false,
    },
  );
  if (!validation.ok || !validation.url) {
    return { enabled: false, href: null, reason: "Invalid meeting link" };
  }

  const opensAt = lesson.startAt.getTime() - LESSON_WINDOW_MS;
  const closesAt = lesson.endAt.getTime() + LESSON_WINDOW_MS;
  const current = now.getTime();

  if (current < opensAt) {
    return { enabled: false, href: null, reason: "Available before lesson" };
  }
  if (current > closesAt) {
    return { enabled: false, href: null, reason: "Lesson has ended" };
  }

  return { enabled: true, href: validation.url, reason: null };
}

export function canJoinLesson(lesson: LessonLike, now: Date): LessonActionAvailability {
  return canUseLessonLink(lesson, now, "Link not available yet");
}

export function canStartLesson(lesson: LessonLike, now: Date): LessonActionAvailability {
  return canUseLessonLink(lesson, now, "Meeting link missing");
}

export function assertValidLessonStatusTransition(
  from: LessonStatus | string,
  to: LessonStatus | string,
) {
  const parsedFrom = parseLessonStatus(from);
  const parsedTo = parseLessonStatus(to);

  if (!parsedFrom || !parsedTo) {
    throw new Error(`Invalid lesson status transition from ${from} to ${to}.`);
  }

  if (parsedFrom === parsedTo && !isTerminalLessonStatus(parsedFrom)) {
    return;
  }

  const allowedTransitions: Record<LessonStatus, Set<LessonStatus>> = {
    [LessonStatus.SCHEDULED]: new Set([
      LessonStatus.LIVE,
      LessonStatus.COMPLETED,
      LessonStatus.CANCELLED,
      LessonStatus.RESCHEDULED,
    ]),
    [LessonStatus.LIVE]: new Set([
      LessonStatus.COMPLETED,
      LessonStatus.CANCELLED,
      LessonStatus.RESCHEDULED,
    ]),
    [LessonStatus.RESCHEDULED]: new Set([
      LessonStatus.LIVE,
      LessonStatus.COMPLETED,
      LessonStatus.CANCELLED,
    ]),
    [LessonStatus.CANCELLED]: new Set(),
    [LessonStatus.COMPLETED]: new Set(),
  };

  if (!allowedTransitions[parsedFrom].has(parsedTo)) {
    throw new Error(`Invalid lesson status transition from ${from} to ${to}.`);
  }
}
