import { google } from "googleapis";

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

type GoogleCalendarMeetingMetadata = {
  liveLessonUrl: string | null;
  googleCalendarEventId: string | null;
  googleMeetSpaceName: string | null;
  meetingProvider: "GOOGLE_MEET";
  meetingUpdatedAt: Date;
};

type DeleteGoogleMeetEventInput = {
  lessonId: string;
  googleCalendarEventId?: string | null;
  behavior?: "cancel" | "delete";
  mode?: "cancel" | "delete";
};

const GOOGLE_CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar"];
const DEFAULT_TIMEZONE = "Africa/Nairobi";

function envValue(key: string) {
  return process.env[key]?.trim() || null;
}

function normalizePrivateKey(privateKey: string | null) {
  return privateKey?.replace(/\\n/g, "\n") ?? null;
}

export function isGoogleCalendarEnabled() {
  const raw = process.env.GOOGLE_CALENDAR_ENABLED ?? "false";
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

export function getGoogleCalendarConfig(): GoogleCalendarConfig {
  const enabled = isGoogleCalendarEnabled();
  const timezone = envValue("GOOGLE_TIMEZONE") ?? DEFAULT_TIMEZONE;

  if (!enabled) {
    return {
      calendarId: null,
      clientEmail: null,
      enabled: false,
      impersonatedUserEmail: null,
      privateKey: null,
      timezone,
    };
  }

  return {
    calendarId: envValue("GOOGLE_CALENDAR_ID") ?? "primary",
    clientEmail: envValue("GOOGLE_CLIENT_EMAIL"),
    enabled: true,
    impersonatedUserEmail: envValue("GOOGLE_IMPERSONATED_USER_EMAIL"),
    privateKey: normalizePrivateKey(envValue("GOOGLE_PRIVATE_KEY")),
    timezone,
  };
}

function requireEnabledConfig() {
  const config = getGoogleCalendarConfig();
  if (!config.enabled) return { config, disabled: true as const };

  const missing = [
    !config.clientEmail ? "GOOGLE_CLIENT_EMAIL" : null,
    !config.privateKey ? "GOOGLE_PRIVATE_KEY" : null,
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Google Calendar configuration missing: ${missing.join(", ")}`);
  }

  return { config, disabled: false as const };
}

function calendarClient(config: GoogleCalendarConfig) {
  const auth = new google.auth.JWT({
    email: config.clientEmail ?? undefined,
    key: config.privateKey ?? undefined,
    scopes: GOOGLE_CALENDAR_SCOPES,
    subject: config.impersonatedUserEmail ?? undefined,
  });

  return google.calendar({ auth, version: "v3" });
}

function eventRequestBody(input: GoogleCalendarLessonInput, timezone: string) {
  const timeZone = input.timezone || timezone || DEFAULT_TIMEZONE;
  return {
    description: input.description ?? undefined,
    end: {
      dateTime: input.endAt.toISOString(),
      timeZone,
    },
    start: {
      dateTime: input.startAt.toISOString(),
      timeZone,
    },
    summary: input.title,
  };
}

function stableRequestId(input: GoogleCalendarLessonInput) {
  const key = `${input.lessonId}-${input.startAt.getTime()}-${input.endAt.getTime()}`;
  return key.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120);
}

function extractMeetUrl(event: Record<string, unknown>) {
  const hangoutLink = typeof event.hangoutLink === "string" ? event.hangoutLink : null;
  if (hangoutLink) return hangoutLink;

  const conferenceData = event.conferenceData as
    | { entryPoints?: Array<{ entryPointType?: string; uri?: string }> }
    | undefined;
  return (
    conferenceData?.entryPoints?.find(
      (entryPoint) => entryPoint.entryPointType === "video" && entryPoint.uri,
    )?.uri ?? null
  );
}

function extractConferenceName(event: Record<string, unknown>) {
  const conferenceData = event.conferenceData as
    | { conferenceId?: string; name?: string; conferenceSolution?: { key?: { type?: string } } }
    | undefined;
  return conferenceData?.conferenceId ?? conferenceData?.name ?? null;
}

function extractMeetingUpdatedAt(event: Record<string, unknown>) {
  return typeof event.updated === "string" ? new Date(event.updated) : new Date();
}

function mapEventMetadata(event: Record<string, unknown>): GoogleCalendarMeetingMetadata {
  return {
    googleCalendarEventId: typeof event.id === "string" ? event.id : null,
    googleMeetSpaceName: extractConferenceName(event),
    liveLessonUrl: extractMeetUrl(event),
    meetingProvider: "GOOGLE_MEET",
    meetingUpdatedAt: extractMeetingUpdatedAt(event),
  };
}

function googleErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  return /google calendar/i.test(message) ? message : `Google Calendar error: ${message}`;
}

export async function createGoogleMeetEventForLesson(input: GoogleCalendarLessonInput): Promise<
  | (GoogleCalendarMeetingMetadata & { enabled?: true })
  | {
      enabled: false;
      reason: "GOOGLE_CALENDAR_DISABLED";
      liveLessonUrl: null;
      googleCalendarEventId: null;
      googleMeetSpaceName: null;
    }
> {
  const { config, disabled } = requireEnabledConfig();
  if (disabled) {
    return {
      enabled: false,
      googleCalendarEventId: null,
      googleMeetSpaceName: null,
      liveLessonUrl: null,
      reason: "GOOGLE_CALENDAR_DISABLED",
    };
  }

  try {
    const calendar = calendarClient(config);
    const response = await calendar.events.insert({
      calendarId: config.calendarId ?? "primary",
      conferenceDataVersion: 1,
      requestBody: {
        ...eventRequestBody(input, config.timezone),
        conferenceData: {
          createRequest: {
            conferenceSolutionKey: { type: "hangoutsMeet" },
            requestId: stableRequestId(input),
          },
        },
      },
    });

    const metadata = mapEventMetadata((response.data ?? {}) as Record<string, unknown>);
    if (!metadata.liveLessonUrl) {
      throw new Error("Google Calendar did not return a Meet link.");
    }
    return metadata;
  } catch (error) {
    throw new Error(googleErrorMessage(error, "Failed to create Google Meet event."));
  }
}

export async function updateGoogleMeetEventForLesson(
  input: GoogleCalendarLessonInput,
): Promise<GoogleCalendarMeetingMetadata> {
  const { config, disabled } = requireEnabledConfig();
  if (disabled) {
    throw new Error("Google Calendar integration is disabled.");
  }
  if (!input.googleCalendarEventId) {
    throw new Error("Google Calendar event id is required to update the Meet event.");
  }

  try {
    const calendar = calendarClient(config);
    const response = await calendar.events.patch({
      calendarId: config.calendarId ?? "primary",
      conferenceDataVersion: 1,
      eventId: input.googleCalendarEventId,
      requestBody: eventRequestBody(input, config.timezone),
    });

    const metadata = mapEventMetadata((response.data ?? {}) as Record<string, unknown>);
    return {
      ...metadata,
      googleCalendarEventId: metadata.googleCalendarEventId ?? input.googleCalendarEventId,
      googleMeetSpaceName: metadata.googleMeetSpaceName ?? input.googleMeetSpaceName ?? null,
    };
  } catch (error) {
    throw new Error(googleErrorMessage(error, "Failed to update Google Meet event."));
  }
}

export async function deleteGoogleMeetEventForLesson(input: DeleteGoogleMeetEventInput) {
  const behavior = input.behavior ?? input.mode ?? "cancel";
  const { config, disabled } = requireEnabledConfig();
  if (!input.googleCalendarEventId) {
    return { reason: "GOOGLE_CALENDAR_EVENT_ID_MISSING", skipped: true };
  }
  if (disabled) {
    return { reason: "GOOGLE_CALENDAR_DISABLED", skipped: true };
  }

  try {
    const calendar = calendarClient(config);
    if (behavior === "delete") {
      await calendar.events.delete({
        calendarId: config.calendarId ?? "primary",
        eventId: input.googleCalendarEventId,
      });
      return { deleted: true };
    }

    await calendar.events.patch({
      calendarId: config.calendarId ?? "primary",
      eventId: input.googleCalendarEventId,
      requestBody: { status: "cancelled" },
    });
    return { cancelled: true };
  } catch (error) {
    throw new Error(googleErrorMessage(error, "Failed to remove Google Meet event."));
  }
}
