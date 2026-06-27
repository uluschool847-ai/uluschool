import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type GoogleCalendarConfig = {
  enabled: boolean;
  calendarId: string | null;
  clientEmail: string | null;
  privateKey: string | null;
  impersonatedUserEmail: string | null;
  timezone: string;
};

type GoogleCalendarLessonInput = {
  lessonId: string;
  title: string;
  description?: string | null;
  startAt: Date;
  endAt: Date;
  timezone?: string | null;
  googleCalendarEventId?: string | null;
  googleMeetSpaceName?: string | null;
};

type GoogleCalendarIntegrationModule = {
  createGoogleMeetEventForLesson: (input: GoogleCalendarLessonInput) => Promise<{
    enabled?: boolean;
    reason?: string;
    liveLessonUrl: string | null;
    googleCalendarEventId: string | null;
    googleMeetSpaceName: string | null;
    meetingProvider?: "GOOGLE_MEET";
    meetingUpdatedAt?: Date;
  }>;
  updateGoogleMeetEventForLesson: (input: GoogleCalendarLessonInput) => Promise<{
    liveLessonUrl: string | null;
    googleCalendarEventId: string | null;
    googleMeetSpaceName: string | null;
    meetingProvider?: "GOOGLE_MEET";
    meetingUpdatedAt?: Date;
  }>;
  deleteGoogleMeetEventForLesson: (input: {
    lessonId: string;
    googleCalendarEventId?: string | null;
    behavior?: "cancel" | "delete";
  }) => Promise<{ skipped?: boolean; deleted?: boolean; cancelled?: boolean; reason?: string }>;
  isGoogleCalendarEnabled: () => boolean;
  getGoogleCalendarConfig: () => GoogleCalendarConfig;
};

const insertMock = vi.hoisted(() => vi.fn());
const patchMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const deleteMock = vi.hoisted(() => vi.fn());
const calendarMock = vi.hoisted(() =>
  vi.fn(() => ({
    events: {
      delete: deleteMock,
      insert: insertMock,
      patch: patchMock,
      update: updateMock,
    },
  })),
);
const jwtMock = vi.hoisted(() => vi.fn());

vi.mock(
  "googleapis",
  () => ({
    google: {
      auth: {
        JWT: jwtMock,
      },
      calendar: calendarMock,
    },
  }),
  { virtual: true },
);

const GOOGLE_ENV_KEYS = [
  "GOOGLE_CALENDAR_ENABLED",
  "GOOGLE_CALENDAR_ID",
  "GOOGLE_CLIENT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
  "GOOGLE_IMPERSONATED_USER_EMAIL",
  "GOOGLE_TIMEZONE",
] as const;

function resetGoogleEnv() {
  for (const key of GOOGLE_ENV_KEYS) {
    delete process.env[key];
  }
}

function enableGoogleCalendar(
  overrides: Partial<Record<(typeof GOOGLE_ENV_KEYS)[number], string>> = {},
) {
  process.env.GOOGLE_CALENDAR_ENABLED = overrides.GOOGLE_CALENDAR_ENABLED ?? "true";
  process.env.GOOGLE_CALENDAR_ID = overrides.GOOGLE_CALENDAR_ID ?? "calendar-1@example.com";
  process.env.GOOGLE_CLIENT_EMAIL =
    overrides.GOOGLE_CLIENT_EMAIL ?? "service-account@example.iam.gserviceaccount.com";
  process.env.GOOGLE_PRIVATE_KEY =
    overrides.GOOGLE_PRIVATE_KEY ??
    "-----BEGIN PRIVATE KEY-----\\nabc123\\n-----END PRIVATE KEY-----";
  process.env.GOOGLE_IMPERSONATED_USER_EMAIL =
    overrides.GOOGLE_IMPERSONATED_USER_EMAIL ?? "calendar-admin@example.com";
  process.env.GOOGLE_TIMEZONE = overrides.GOOGLE_TIMEZONE ?? "Africa/Nairobi";
}

function lessonInput(
  overrides: Partial<GoogleCalendarLessonInput> = {},
): GoogleCalendarLessonInput {
  return {
    lessonId: "lesson-1",
    title: "Quadratic functions",
    description: "Solve quadratic equations together.",
    startAt: new Date("2026-06-01T10:00:00.000Z"),
    endAt: new Date("2026-06-01T11:00:00.000Z"),
    timezone: "Africa/Nairobi",
    ...overrides,
  };
}

async function loadGoogleCalendarIntegration() {
  const specifier = "@/lib/integrations/google-calendar";
  return import(/* @vite-ignore */ specifier) as Promise<GoogleCalendarIntegrationModule>;
}

function insertedEventBody() {
  const call = insertMock.mock.calls.at(-1)?.[0] as { requestBody?: unknown } | undefined;
  return call?.requestBody as Record<string, unknown>;
}

function patchedEventBody() {
  const call = patchMock.mock.calls.at(-1)?.[0] as { requestBody?: unknown } | undefined;
  return call?.requestBody as Record<string, unknown>;
}

describe("Google Calendar Meet integration service config", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resetGoogleEnv();
  });

  afterEach(() => {
    resetGoogleEnv();
    vi.unstubAllEnvs();
  });

  it("does not initialize Google clients or require credentials during module import", async () => {
    const { getGoogleCalendarConfig, isGoogleCalendarEnabled } =
      await loadGoogleCalendarIntegration();

    expect(isGoogleCalendarEnabled()).toBe(false);
    expect(getGoogleCalendarConfig()).toEqual(
      expect.objectContaining({
        enabled: false,
        timezone: "Africa/Nairobi",
      }),
    );
    expect(jwtMock).not.toHaveBeenCalled();
    expect(calendarMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(patchMock).not.toHaveBeenCalled();
  });

  it("does not require Google credentials at startup when the integration is disabled", async () => {
    process.env.GOOGLE_CALENDAR_ENABLED = "false";

    const { getGoogleCalendarConfig, isGoogleCalendarEnabled } =
      await loadGoogleCalendarIntegration();

    expect(isGoogleCalendarEnabled()).toBe(false);
    expect(() => getGoogleCalendarConfig()).not.toThrow();
    expect(getGoogleCalendarConfig()).toEqual(
      expect.objectContaining({
        calendarId: null,
        clientEmail: null,
        enabled: false,
        privateKey: null,
        timezone: "Africa/Nairobi",
      }),
    );
    expect(jwtMock).not.toHaveBeenCalled();
    expect(calendarMock).not.toHaveBeenCalled();
  });

  it("reads Google Calendar environment config with Africa/Nairobi as the default timezone", async () => {
    enableGoogleCalendar({ GOOGLE_TIMEZONE: "" });

    const { getGoogleCalendarConfig, isGoogleCalendarEnabled } =
      await loadGoogleCalendarIntegration();

    expect(isGoogleCalendarEnabled()).toBe(true);
    expect(getGoogleCalendarConfig()).toEqual({
      enabled: true,
      calendarId: "calendar-1@example.com",
      clientEmail: "service-account@example.iam.gserviceaccount.com",
      impersonatedUserEmail: "calendar-admin@example.com",
      privateKey: "-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----",
      timezone: "Africa/Nairobi",
    });
  });

  it("returns disabled state and does not call Google API when integration is disabled", async () => {
    process.env.GOOGLE_CALENDAR_ENABLED = "false";

    const { createGoogleMeetEventForLesson, getGoogleCalendarConfig, isGoogleCalendarEnabled } =
      await loadGoogleCalendarIntegration();

    expect(isGoogleCalendarEnabled()).toBe(false);
    expect(getGoogleCalendarConfig()).toEqual(
      expect.objectContaining({
        enabled: false,
        timezone: "Africa/Nairobi",
      }),
    );

    await expect(createGoogleMeetEventForLesson(lessonInput())).resolves.toEqual(
      expect.objectContaining({
        enabled: false,
        liveLessonUrl: null,
        reason: "GOOGLE_CALENDAR_DISABLED",
      }),
    );
    expect(calendarMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("uses primary calendar when GOOGLE_CALENDAR_ID is not configured", async () => {
    enableGoogleCalendar();
    Reflect.deleteProperty(process.env, "GOOGLE_CALENDAR_ID");

    const { getGoogleCalendarConfig } = await loadGoogleCalendarIntegration();

    expect(getGoogleCalendarConfig()).toEqual(
      expect.objectContaining({
        calendarId: "primary",
        enabled: true,
      }),
    );
  });

  it.each(["GOOGLE_CLIENT_EMAIL", "GOOGLE_PRIVATE_KEY"] as const)(
    "throws a clear configuration error when %s is missing and integration is enabled",
    async (missingKey) => {
      enableGoogleCalendar();
      delete process.env[missingKey];

      const { createGoogleMeetEventForLesson } = await loadGoogleCalendarIntegration();

      await expect(createGoogleMeetEventForLesson(lessonInput())).rejects.toThrow(
        new RegExp(`${missingKey}|Google Calendar`, "i"),
      );
      expect(calendarMock).not.toHaveBeenCalled();
    },
  );
});

describe("Google Calendar Meet event lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resetGoogleEnv();
    enableGoogleCalendar();
  });

  afterEach(() => {
    resetGoogleEnv();
  });

  it("creates a Google Meet event with Calendar conference data and returns lesson meeting metadata", async () => {
    insertMock.mockResolvedValueOnce({
      data: {
        conferenceData: {
          conferenceId: "abc-defg-hij",
          conferenceSolution: { key: { type: "hangoutsMeet" } },
          entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/fallback-link" }],
        },
        hangoutLink: "https://meet.google.com/abc-defg-hij",
        id: "calendar-event-1",
        updated: "2026-06-01T09:30:00.000Z",
      },
    });

    const { createGoogleMeetEventForLesson } = await loadGoogleCalendarIntegration();
    const result = await createGoogleMeetEventForLesson(lessonInput());

    expect(calendarMock).toHaveBeenCalledWith(expect.objectContaining({ version: "v3" }));
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: "calendar-1@example.com",
        conferenceDataVersion: 1,
      }),
    );
    expect(insertedEventBody()).toEqual(
      expect.objectContaining({
        conferenceData: {
          createRequest: expect.objectContaining({
            conferenceSolutionKey: { type: "hangoutsMeet" },
            requestId: expect.stringMatching(/lesson-1/),
          }),
        },
        description: "Solve quadratic equations together.",
        end: { dateTime: "2026-06-01T11:00:00.000Z", timeZone: "Africa/Nairobi" },
        start: { dateTime: "2026-06-01T10:00:00.000Z", timeZone: "Africa/Nairobi" },
        summary: "Quadratic functions",
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        googleCalendarEventId: "calendar-event-1",
        googleMeetSpaceName: "abc-defg-hij",
        liveLessonUrl: "https://meet.google.com/abc-defg-hij",
        meetingProvider: "GOOGLE_MEET",
      }),
    );
    expect(result.meetingUpdatedAt).toBeInstanceOf(Date);
  });

  it("uses conference video entry point as Meet URL fallback when hangoutLink is absent", async () => {
    insertMock.mockResolvedValueOnce({
      data: {
        conferenceData: {
          conferenceId: "fallback-conference",
          entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/fallback-link" }],
        },
        id: "calendar-event-fallback",
      },
    });

    const { createGoogleMeetEventForLesson } = await loadGoogleCalendarIntegration();

    await expect(createGoogleMeetEventForLesson(lessonInput())).resolves.toEqual(
      expect.objectContaining({
        googleCalendarEventId: "calendar-event-fallback",
        googleMeetSpaceName: "fallback-conference",
        liveLessonUrl: "https://meet.google.com/fallback-link",
      }),
    );
  });

  it("updates an existing event while preserving Meet conference data", async () => {
    patchMock.mockResolvedValueOnce({
      data: {
        conferenceData: {
          conferenceId: "abc-defg-hij",
          entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" }],
        },
        hangoutLink: "https://meet.google.com/abc-defg-hij",
        id: "calendar-event-1",
        updated: "2026-06-01T09:45:00.000Z",
      },
    });

    const { updateGoogleMeetEventForLesson } = await loadGoogleCalendarIntegration();
    const result = await updateGoogleMeetEventForLesson(
      lessonInput({
        description: "Updated lesson notes.",
        endAt: new Date("2026-06-01T11:30:00.000Z"),
        googleCalendarEventId: "calendar-event-1",
        title: "Updated quadratic functions",
      }),
    );

    expect(patchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: "calendar-1@example.com",
        conferenceDataVersion: 1,
        eventId: "calendar-event-1",
      }),
    );
    expect(patchedEventBody()).toEqual(
      expect.objectContaining({
        description: "Updated lesson notes.",
        end: { dateTime: "2026-06-01T11:30:00.000Z", timeZone: "Africa/Nairobi" },
        start: { dateTime: "2026-06-01T10:00:00.000Z", timeZone: "Africa/Nairobi" },
        summary: "Updated quadratic functions",
      }),
    );
    expect(patchedEventBody()).not.toHaveProperty("conferenceData.createRequest");
    expect(result).toEqual(
      expect.objectContaining({
        googleCalendarEventId: "calendar-event-1",
        googleMeetSpaceName: "abc-defg-hij",
        liveLessonUrl: "https://meet.google.com/abc-defg-hij",
        meetingProvider: "GOOGLE_MEET",
      }),
    );
  });

  it("cancels or deletes existing Google Calendar events and handles missing event ids safely", async () => {
    patchMock.mockResolvedValueOnce({ data: { id: "calendar-event-1", status: "cancelled" } });
    deleteMock.mockResolvedValueOnce({});

    const { deleteGoogleMeetEventForLesson } = await loadGoogleCalendarIntegration();

    await expect(
      deleteGoogleMeetEventForLesson({
        behavior: "cancel",
        googleCalendarEventId: "calendar-event-1",
        lessonId: "lesson-1",
      }),
    ).resolves.toEqual(expect.objectContaining({ cancelled: true }));
    expect(patchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: "calendar-1@example.com",
        eventId: "calendar-event-1",
        requestBody: { status: "cancelled" },
      }),
    );

    await expect(
      deleteGoogleMeetEventForLesson({
        behavior: "delete",
        googleCalendarEventId: "calendar-event-2",
        lessonId: "lesson-2",
      }),
    ).resolves.toEqual(expect.objectContaining({ deleted: true }));
    expect(deleteMock).toHaveBeenCalledWith({
      calendarId: "calendar-1@example.com",
      eventId: "calendar-event-2",
    });

    await expect(
      deleteGoogleMeetEventForLesson({
        googleCalendarEventId: null,
        lessonId: "lesson-without-event",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        reason: "GOOGLE_CALENDAR_EVENT_ID_MISSING",
        skipped: true,
      }),
    );
  });

  it("surfaces Google API failures and never returns a fake Meet URL", async () => {
    insertMock.mockRejectedValueOnce(new Error("Google Calendar quota exceeded"));

    const { createGoogleMeetEventForLesson } = await loadGoogleCalendarIntegration();

    await expect(createGoogleMeetEventForLesson(lessonInput())).rejects.toThrow(
      /Google Calendar quota exceeded|Google Calendar/i,
    );
    expect(insertMock).toHaveBeenCalledTimes(1);
  });
});
