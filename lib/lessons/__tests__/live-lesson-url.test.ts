import { describe, expect, it } from "vitest";

type LessonStatus = "SCHEDULED" | "LIVE" | "COMPLETED" | "CANCELLED" | "RESCHEDULED";
type MeetingProvider = "GOOGLE_MEET" | "MANUAL_URL";

type LiveLessonUrlModule = {
  normalizeLiveLessonUrl: (url: string | null | undefined) => string | null;
  isGoogleMeetUrl: (url: string | null | undefined) => boolean;
  validateLiveLessonUrl: (
    url: string | null | undefined,
    provider: MeetingProvider,
    options?: { required?: boolean },
  ) =>
    | { ok: true; url: string | null; missing?: boolean; reason?: string | null }
    | { ok: false; url?: null; missing?: boolean; reason: string };
  canShowJoinButton: (
    lesson: {
      status: LessonStatus;
      startAt: Date;
      endAt: Date;
      liveLessonUrl?: string | null;
      meetingProvider?: MeetingProvider;
    },
    now: Date,
  ) => { enabled: boolean; href: string | null; reason: string | null };
};

type LessonStatusModule = {
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
};

async function loadLiveLessonUrlModule() {
  const specifier = "@/lib/lessons/live-lesson-url";
  return import(/* @vite-ignore */ specifier) as Promise<LiveLessonUrlModule>;
}

async function loadLessonStatusModule() {
  const specifier = "@/lib/lessons/lesson-status";
  return import(/* @vite-ignore */ specifier) as Promise<LessonStatusModule>;
}

function lesson(
  overrides: Partial<{
    status: LessonStatus;
    liveLessonUrl: string | null;
    startAt: Date;
    endAt: Date;
    meetingProvider: MeetingProvider;
  }> = {},
) {
  return {
    status: overrides.status ?? ("SCHEDULED" as LessonStatus),
    startAt: overrides.startAt ?? new Date("2026-06-01T10:00:00.000Z"),
    endAt: overrides.endAt ?? new Date("2026-06-01T11:00:00.000Z"),
    liveLessonUrl:
      overrides.liveLessonUrl === undefined
        ? "https://meet.google.com/abc-defg-hij"
        : overrides.liveLessonUrl,
    meetingProvider: overrides.meetingProvider ?? ("GOOGLE_MEET" as MeetingProvider),
  };
}

describe("live lesson URL helpers", () => {
  it("normalizes and recognizes Google Meet URLs", async () => {
    const { isGoogleMeetUrl, normalizeLiveLessonUrl } = await loadLiveLessonUrlModule();

    expect(normalizeLiveLessonUrl("  https://meet.google.com/abc-defg-hij  ")).toBe(
      "https://meet.google.com/abc-defg-hij",
    );
    expect(isGoogleMeetUrl("https://meet.google.com/abc-defg-hij")).toBe(true);
    expect(isGoogleMeetUrl("https://meet.google.com/lookup/safe-room-code")).toBe(true);
    expect(isGoogleMeetUrl("https://example.com/meeting")).toBe(false);
  });

  it("validates Google Meet links and rejects unsafe or wrong-provider URLs", async () => {
    const { validateLiveLessonUrl } = await loadLiveLessonUrlModule();

    expect(validateLiveLessonUrl("https://meet.google.com/abc-defg-hij", "GOOGLE_MEET")).toEqual({
      ok: true,
      url: "https://meet.google.com/abc-defg-hij",
    });
    expect(
      validateLiveLessonUrl("https://meet.google.com/lookup/safe-room-code", "GOOGLE_MEET"),
    ).toEqual({
      ok: true,
      url: "https://meet.google.com/lookup/safe-room-code",
    });

    for (const unsafeUrl of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///Users/test/meeting.html",
      "http://meet.google.com/abc-defg-hij",
      "https://zoom.us/j/123456789",
    ]) {
      expect(validateLiveLessonUrl(unsafeUrl, "GOOGLE_MEET")).toEqual(
        expect.objectContaining({
          ok: false,
          reason: expect.any(String),
        }),
      );
    }
  });

  it("allows safe manual HTTPS URLs only for MANUAL_URL provider", async () => {
    const { validateLiveLessonUrl } = await loadLiveLessonUrlModule();

    expect(validateLiveLessonUrl(" https://example.com/live/classroom ", "MANUAL_URL")).toEqual({
      ok: true,
      url: "https://example.com/live/classroom",
    });
    expect(validateLiveLessonUrl("https://example.com/live/classroom", "GOOGLE_MEET")).toEqual(
      expect.objectContaining({
        ok: false,
        reason: expect.any(String),
      }),
    );

    for (const unsafeUrl of [
      "http://example.com/live/classroom",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///tmp/classroom.html",
    ]) {
      expect(validateLiveLessonUrl(unsafeUrl, "MANUAL_URL")).toEqual(
        expect.objectContaining({
          ok: false,
          reason: expect.any(String),
        }),
      );
    }
  });

  it("handles required and optional missing links with stable missing-link state", async () => {
    const { validateLiveLessonUrl } = await loadLiveLessonUrlModule();

    expect(validateLiveLessonUrl("", "GOOGLE_MEET", { required: true })).toEqual({
      ok: false,
      reason: "Meeting link is required",
    });
    expect(validateLiveLessonUrl(null, "GOOGLE_MEET", { required: false })).toEqual({
      ok: true,
      url: null,
      missing: true,
      reason: "Meeting link not available yet",
    });
  });

  it("returns stable join button state for terminal, missing-link, early, and active lessons", async () => {
    const { canShowJoinButton } = await loadLiveLessonUrlModule();
    const duringLesson = new Date("2026-06-01T10:15:00.000Z");

    expect(canShowJoinButton(lesson({ status: "CANCELLED" }), duringLesson)).toEqual({
      enabled: false,
      href: null,
      reason: "Lesson cancelled",
    });
    expect(canShowJoinButton(lesson({ status: "COMPLETED" }), duringLesson)).toEqual({
      enabled: false,
      href: null,
      reason: "Lesson completed",
    });
    expect(canShowJoinButton(lesson({ liveLessonUrl: null }), duringLesson)).toEqual({
      enabled: false,
      href: null,
      reason: "Meeting link not available yet",
    });
    expect(canShowJoinButton(lesson(), new Date("2026-06-01T09:44:59.999Z"))).toEqual({
      enabled: false,
      href: null,
      reason: "Available before lesson",
    });
    expect(canShowJoinButton(lesson(), new Date("2026-06-01T09:45:00.000Z"))).toEqual({
      enabled: true,
      href: "https://meet.google.com/abc-defg-hij",
      reason: null,
    });
    expect(canShowJoinButton(lesson(), new Date("2026-06-01T11:15:00.000Z"))).toEqual({
      enabled: true,
      href: "https://meet.google.com/abc-defg-hij",
      reason: null,
    });
  });

  it("validates the visible join button using the lesson's actual meeting provider", async () => {
    const { canShowJoinButton } = await loadLiveLessonUrlModule();
    const duringLesson = new Date("2026-06-01T10:15:00.000Z");

    expect(
      canShowJoinButton(
        lesson({
          meetingProvider: "GOOGLE_MEET",
          liveLessonUrl: "https://example.com/live/classroom",
        }),
        duringLesson,
      ),
    ).toEqual({
      enabled: false,
      href: null,
      reason: "Invalid meeting link",
    });
    expect(
      canShowJoinButton(
        lesson({
          meetingProvider: "MANUAL_URL",
          liveLessonUrl: "https://example.com/live/classroom",
        }),
        duringLesson,
      ),
    ).toEqual({
      enabled: true,
      href: "https://example.com/live/classroom",
      reason: null,
    });
  });

  it("surfaces invalid provider/url combinations as invalid meeting links for visible controls", async () => {
    const { canShowJoinButton } = await loadLiveLessonUrlModule();
    const duringLesson = new Date("2026-06-01T10:15:00.000Z");

    expect(
      canShowJoinButton(
        lesson({
          meetingProvider: "GOOGLE_MEET",
          liveLessonUrl: "https://example.com/live/classroom",
        }),
        duringLesson,
      ),
    ).toEqual({
      enabled: false,
      href: null,
      reason: "Invalid meeting link",
    });
  });

  it("requires shared start and join helpers to validate URLs with the actual provider", async () => {
    const { canJoinLesson, canStartLesson } = await loadLessonStatusModule();
    const duringLesson = new Date("2026-06-01T10:15:00.000Z");

    for (const helper of [canJoinLesson, canStartLesson]) {
      expect(
        helper(
          lesson({
            meetingProvider: "GOOGLE_MEET",
            liveLessonUrl: "https://example.com/live/classroom",
          }),
          duringLesson,
        ),
      ).toEqual({
        enabled: false,
        href: null,
        reason: expect.stringMatching(/invalid meeting link|not available|missing/i),
      });
      expect(
        helper(
          lesson({
            meetingProvider: "MANUAL_URL",
            liveLessonUrl: "https://example.com/live/classroom",
          }),
          duringLesson,
        ),
      ).toEqual({
        enabled: true,
        href: "https://example.com/live/classroom",
        reason: null,
      });
    }
  });
});
