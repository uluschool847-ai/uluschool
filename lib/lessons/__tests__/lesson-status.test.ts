import { describe, expect, it } from "vitest";

type LessonStatus = "SCHEDULED" | "LIVE" | "COMPLETED" | "CANCELLED" | "RESCHEDULED";
type MeetingProvider = "GOOGLE_MEET" | "MANUAL_URL";

type LessonStatusModule = {
  LESSON_STATUS_LABELS: Record<LessonStatus, string>;
  LESSON_STATUS_DESCRIPTIONS: Record<LessonStatus, string>;
  LESSON_STATUS_BADGE_VARIANTS: Record<LessonStatus, string>;
  deriveLessonRuntimeStatus: (
    lesson: {
      status: LessonStatus;
      startAt: Date;
      endAt: Date;
      rescheduledFromId?: string | null;
    },
    now: Date,
  ) => {
    lifecycleStatus: LessonStatus;
    displayStatus: LessonStatus;
    isRescheduled: boolean;
    rescheduledFromId: string | null;
  };
  canJoinLesson: (
    lesson: {
      status: LessonStatus;
      startAt: Date;
      endAt: Date;
      liveLessonUrl?: string | null;
      meetingProvider?: MeetingProvider;
    },
    now: Date,
  ) => { enabled: boolean; href: string | null; reason: string | null };
  canStartLesson: (
    lesson: {
      status: LessonStatus;
      startAt: Date;
      endAt: Date;
      liveLessonUrl?: string | null;
      meetingProvider?: MeetingProvider;
    },
    now: Date,
  ) => { enabled: boolean; href: string | null; reason: string | null };
  parseLessonStatus: (input: unknown) => LessonStatus | null;
  isTerminalLessonStatus: (status: LessonStatus) => boolean;
  isActiveLessonStatus: (status: LessonStatus) => boolean;
  assertValidLessonStatusTransition: (from: LessonStatus, to: LessonStatus) => void;
};

async function loadLessonStatusModule() {
  const specifier = "@/lib/lessons/lesson-status";
  return import(/* @vite-ignore */ specifier) as Promise<LessonStatusModule>;
}

function lesson(
  overrides: Partial<{
    status: LessonStatus;
    liveLessonUrl: string | null;
    meetingProvider: MeetingProvider;
  }> = {},
) {
  return {
    startAt: new Date("2026-06-01T10:00:00.000Z"),
    endAt: new Date("2026-06-01T11:00:00.000Z"),
    status: overrides.status ?? ("SCHEDULED" as LessonStatus),
    liveLessonUrl:
      overrides.liveLessonUrl === undefined
        ? "https://meet.google.com/abc-defg-hij"
        : overrides.liveLessonUrl,
    meetingProvider: overrides.meetingProvider ?? ("GOOGLE_MEET" as MeetingProvider),
  };
}

describe("lesson status runtime helpers", () => {
  it("exposes exhaustive labels, descriptions, and badge variants for every lesson status", async () => {
    const { LESSON_STATUS_BADGE_VARIANTS, LESSON_STATUS_DESCRIPTIONS, LESSON_STATUS_LABELS } =
      await loadLessonStatusModule();
    const statuses: LessonStatus[] = ["SCHEDULED", "LIVE", "COMPLETED", "CANCELLED", "RESCHEDULED"];

    expect(LESSON_STATUS_LABELS).toEqual({
      SCHEDULED: "Scheduled",
      LIVE: "Live",
      COMPLETED: "Completed",
      CANCELLED: "Cancelled",
      RESCHEDULED: "Rescheduled",
    });
    expect(Object.keys(LESSON_STATUS_DESCRIPTIONS).sort()).toEqual([...statuses].sort());
    expect(Object.keys(LESSON_STATUS_BADGE_VARIANTS).sort()).toEqual([...statuses].sort());
    for (const status of statuses) {
      expect(LESSON_STATUS_DESCRIPTIONS[status]).toEqual(expect.any(String));
      expect(LESSON_STATUS_DESCRIPTIONS[status].length).toBeGreaterThan(0);
      expect(LESSON_STATUS_BADGE_VARIANTS[status]).toEqual(expect.any(String));
      expect(LESSON_STATUS_BADGE_VARIANTS[status].length).toBeGreaterThan(0);
    }
  });

  it("parses only known lesson status enum values and returns null for invalid input", async () => {
    const { parseLessonStatus } = await loadLessonStatusModule();

    for (const status of [
      "SCHEDULED",
      "LIVE",
      "COMPLETED",
      "CANCELLED",
      "RESCHEDULED",
    ] as LessonStatus[]) {
      expect(parseLessonStatus(status)).toBe(status);
    }

    for (const invalid of ["", "scheduled", "ARCHIVED", "DELETED", null, undefined, 123, {}]) {
      expect(() => parseLessonStatus(invalid)).not.toThrow();
      expect(parseLessonStatus(invalid)).toBeNull();
    }
  });

  it("classifies terminal and active lesson statuses consistently", async () => {
    const { isActiveLessonStatus, isTerminalLessonStatus } = await loadLessonStatusModule();

    expect(isTerminalLessonStatus("CANCELLED")).toBe(true);
    expect(isTerminalLessonStatus("COMPLETED")).toBe(true);
    expect(isTerminalLessonStatus("SCHEDULED")).toBe(false);
    expect(isTerminalLessonStatus("LIVE")).toBe(false);
    expect(isTerminalLessonStatus("RESCHEDULED")).toBe(false);

    expect(isActiveLessonStatus("SCHEDULED")).toBe(true);
    expect(isActiveLessonStatus("LIVE")).toBe(true);
    expect(isActiveLessonStatus("RESCHEDULED")).toBe(true);
    expect(isActiveLessonStatus("CANCELLED")).toBe(false);
    expect(isActiveLessonStatus("COMPLETED")).toBe(false);
  });

  it("derives display status without mutating explicit terminal statuses", async () => {
    const { deriveLessonRuntimeStatus } = await loadLessonStatusModule();
    const now = new Date("2026-06-01T10:15:00.000Z");

    expect(deriveLessonRuntimeStatus(lesson({ status: "CANCELLED" }), now)).toEqual(
      expect.objectContaining({
        lifecycleStatus: "CANCELLED",
        displayStatus: "CANCELLED",
        isRescheduled: false,
      }),
    );
    expect(deriveLessonRuntimeStatus(lesson({ status: "COMPLETED" }), now)).toEqual(
      expect.objectContaining({
        lifecycleStatus: "COMPLETED",
        displayStatus: "COMPLETED",
        isRescheduled: false,
      }),
    );
  });

  it("derives live and completed display status for scheduled lessons", async () => {
    const { deriveLessonRuntimeStatus } = await loadLessonStatusModule();

    expect(deriveLessonRuntimeStatus(lesson(), new Date("2026-06-01T10:15:00.000Z"))).toEqual(
      expect.objectContaining({
        lifecycleStatus: "SCHEDULED",
        displayStatus: "LIVE",
      }),
    );
    expect(deriveLessonRuntimeStatus(lesson(), new Date("2026-06-01T11:15:00.001Z"))).toEqual(
      expect.objectContaining({
        lifecycleStatus: "SCHEDULED",
        displayStatus: "COMPLETED",
      }),
    );
  });

  it("keeps rescheduled marker metadata separate from runtime display status", async () => {
    const { deriveLessonRuntimeStatus } = await loadLessonStatusModule();

    expect(
      deriveLessonRuntimeStatus(
        { ...lesson({ status: "RESCHEDULED" }), rescheduledFromId: "lesson-original" },
        new Date("2026-06-01T10:15:00.000Z"),
      ),
    ).toEqual(
      expect.objectContaining({
        lifecycleStatus: "RESCHEDULED",
        isRescheduled: true,
        rescheduledFromId: "lesson-original",
      }),
    );
  });

  it("uses the same 15 minute lesson window for student join and teacher start", async () => {
    const { canJoinLesson, canStartLesson } = await loadLessonStatusModule();
    const currentLesson = lesson();

    for (const helper of [canJoinLesson, canStartLesson]) {
      expect(helper(currentLesson, new Date("2026-06-01T09:44:59.999Z"))).toEqual({
        enabled: false,
        href: null,
        reason: "Available before lesson",
      });
      expect(helper(currentLesson, new Date("2026-06-01T09:45:00.000Z"))).toEqual({
        enabled: true,
        href: "https://meet.google.com/abc-defg-hij",
        reason: null,
      });
      expect(helper(currentLesson, new Date("2026-06-01T11:15:00.000Z"))).toEqual({
        enabled: true,
        href: "https://meet.google.com/abc-defg-hij",
        reason: null,
      });
      expect(helper(currentLesson, new Date("2026-06-01T11:15:00.001Z"))).toEqual({
        enabled: false,
        href: null,
        reason: "Lesson has ended",
      });
    }
  });

  it("disables join/start for terminal lessons and missing meeting links", async () => {
    const { canJoinLesson, canStartLesson } = await loadLessonStatusModule();
    const now = new Date("2026-06-01T10:15:00.000Z");

    expect(canJoinLesson(lesson({ status: "CANCELLED" }), now)).toEqual({
      enabled: false,
      href: null,
      reason: "Lesson is cancelled",
    });
    expect(canStartLesson(lesson({ status: "CANCELLED" }), now)).toEqual({
      enabled: false,
      href: null,
      reason: "Lesson is cancelled",
    });
    expect(canJoinLesson(lesson({ status: "COMPLETED" }), now)).toEqual({
      enabled: false,
      href: null,
      reason: "Lesson is completed",
    });
    expect(canStartLesson(lesson({ status: "COMPLETED" }), now)).toEqual({
      enabled: false,
      href: null,
      reason: "Lesson is completed",
    });
    expect(canJoinLesson(lesson({ liveLessonUrl: null }), now)).toEqual({
      enabled: false,
      href: null,
      reason: "Link not available yet",
    });
    expect(canStartLesson(lesson({ liveLessonUrl: null }), now)).toEqual({
      enabled: false,
      href: null,
      reason: "Meeting link missing",
    });
  });

  it("keeps teacher Start Lesson edge-case reasons stable across provider and lifecycle states", async () => {
    const { canStartLesson } = await loadLessonStatusModule();
    const now = new Date("2026-06-01T10:15:00.000Z");

    expect(canStartLesson(lesson(), now)).toEqual({
      enabled: true,
      href: "https://meet.google.com/abc-defg-hij",
      reason: null,
    });
    expect(
      canStartLesson(
        lesson({
          meetingProvider: "MANUAL_URL",
          liveLessonUrl: "https://example.com/live/classroom",
        }),
        now,
      ),
    ).toEqual({
      enabled: true,
      href: "https://example.com/live/classroom",
      reason: null,
    });
    expect(
      canStartLesson(
        lesson({
          meetingProvider: "GOOGLE_MEET",
          liveLessonUrl: "https://example.com/live/classroom",
        }),
        now,
      ),
    ).toEqual({ enabled: false, href: null, reason: "Invalid meeting link" });

    for (const unsafeUrl of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///tmp/lesson.html",
      "http://meet.google.com/abc-defg-hij",
    ]) {
      expect(canStartLesson(lesson({ liveLessonUrl: unsafeUrl }), now)).toEqual({
        enabled: false,
        href: null,
        reason: "Invalid meeting link",
      });
    }

    expect(canStartLesson(lesson({ liveLessonUrl: null }), now)).toEqual({
      enabled: false,
      href: null,
      reason: "Meeting link missing",
    });
    expect(canStartLesson(lesson(), new Date("2026-06-01T09:44:59.999Z"))).toEqual({
      enabled: false,
      href: null,
      reason: "Available before lesson",
    });
    expect(canStartLesson(lesson(), new Date("2026-06-01T11:15:00.001Z"))).toEqual({
      enabled: false,
      href: null,
      reason: "Lesson has ended",
    });
    expect(canStartLesson(lesson({ status: "CANCELLED" }), now)).toEqual({
      enabled: false,
      href: null,
      reason: "Lesson is cancelled",
    });
    expect(canStartLesson(lesson({ status: "COMPLETED" }), now)).toEqual({
      enabled: false,
      href: null,
      reason: "Lesson is completed",
    });
    expect(canStartLesson(lesson({ status: "RESCHEDULED" }), now)).toEqual({
      enabled: true,
      href: "https://meet.google.com/abc-defg-hij",
      reason: null,
    });
  });

  it("blocks invalid lesson lifecycle transitions", async () => {
    const { assertValidLessonStatusTransition } = await loadLessonStatusModule();

    expect(() => assertValidLessonStatusTransition("SCHEDULED", "CANCELLED")).not.toThrow();
    expect(() => assertValidLessonStatusTransition("SCHEDULED", "RESCHEDULED")).not.toThrow();
    expect(() => assertValidLessonStatusTransition("LIVE", "COMPLETED")).not.toThrow();
    expect(() => assertValidLessonStatusTransition("RESCHEDULED", "CANCELLED")).not.toThrow();

    expect(() => assertValidLessonStatusTransition("CANCELLED", "LIVE")).toThrow(
      /invalid status transition|cancelled/i,
    );
    expect(() => assertValidLessonStatusTransition("CANCELLED", "COMPLETED")).toThrow(
      /invalid status transition|cancelled/i,
    );
    expect(() => assertValidLessonStatusTransition("COMPLETED", "RESCHEDULED")).toThrow(
      /invalid status transition|completed/i,
    );
  });

  it.each([
    ["SCHEDULED", "LIVE"],
    ["SCHEDULED", "COMPLETED"],
    ["SCHEDULED", "CANCELLED"],
    ["SCHEDULED", "RESCHEDULED"],
    ["LIVE", "COMPLETED"],
    ["LIVE", "CANCELLED"],
    ["LIVE", "RESCHEDULED"],
    ["RESCHEDULED", "LIVE"],
    ["RESCHEDULED", "COMPLETED"],
    ["RESCHEDULED", "CANCELLED"],
  ] as Array<[LessonStatus, LessonStatus]>)(
    "allows lifecycle transition %s -> %s",
    async (from, to) => {
      const { assertValidLessonStatusTransition } = await loadLessonStatusModule();

      expect(() => assertValidLessonStatusTransition(from, to)).not.toThrow();
    },
  );

  it.each(
    (["CANCELLED", "COMPLETED"] as LessonStatus[]).flatMap((from) =>
      (["SCHEDULED", "LIVE", "COMPLETED", "CANCELLED", "RESCHEDULED"] as LessonStatus[]).map(
        (to) => [from, to] as [LessonStatus, LessonStatus],
      ),
    ),
  )("blocks terminal lifecycle transition %s -> %s", async (from, to) => {
    const { assertValidLessonStatusTransition } = await loadLessonStatusModule();

    expect(() => assertValidLessonStatusTransition(from, to)).toThrow(
      /invalid status transition|cancelled|completed/i,
    );
  });

  it("blocks RESCHEDULED -> SCHEDULED lifecycle regression", async () => {
    const { assertValidLessonStatusTransition } = await loadLessonStatusModule();

    expect(() => assertValidLessonStatusTransition("RESCHEDULED", "SCHEDULED")).toThrow(
      /invalid status transition|rescheduled/i,
    );
  });
});
