export type AvailabilitySlotStatus = "ACTIVE" | "INACTIVE";

export type WeeklyAvailabilityRule = {
  weekday: number;
  startTime: string;
  endTime: string;
  timezone?: string | null;
  status: AvailabilitySlotStatus | string;
};

export const DEFAULT_AVAILABILITY_TIMEZONE = "Europe/Kiev";

type DateParts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  minutes: number;
};

const WEEKDAY_TO_NUMBER: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

function assertValidRange(startAt: Date, endAt: Date) {
  if (!(startAt instanceof Date) || Number.isNaN(startAt.getTime())) {
    throw new Error("Invalid range: startAt must be a valid date.");
  }
  if (!(endAt instanceof Date) || Number.isNaN(endAt.getTime())) {
    throw new Error("Invalid range: endAt must be a valid date.");
  }
  if (startAt >= endAt) {
    throw new Error("Invalid range: startAt must be before endAt.");
  }
}

export function isValidTimezone(timezone: string | null | undefined) {
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function normalizeAvailabilityTimezone(timezone: string | null | undefined) {
  const value = timezone?.trim();
  return value && isValidTimezone(value) ? value : DEFAULT_AVAILABILITY_TIMEZONE;
}

function parseTimeToMinutes(time: string) {
  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw new Error("Time must use HH:mm format.");
  }
  const [hours, minutes] = time.split(":").map(Number);
  if (hours > 23 || minutes > 59) {
    throw new Error("Time must use HH:mm format.");
  }
  return hours * 60 + minutes;
}

function getDateParts(date: Date, timezone: string): DateParts {
  const safeTimezone = normalizeAvailabilityTimezone(timezone);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour === "24" ? "0" : parts.hour);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAY_TO_NUMBER[parts.weekday] ?? 0,
    minutes: hour * 60 + Number(parts.minute),
  };
}

function parseLocalDateTimeValue(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    const absolute = new Date(value);
    if (!Number.isNaN(absolute.getTime())) return absolute;
    throw new Error("Date and time must be valid.");
  }
  const [, year, month, day, hour, minute, second = "00"] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
  };
}

function getTimezoneOffsetMs(date: Date, timezone: string) {
  const safeTimezone = normalizeAvailabilityTimezone(timezone);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour === "24" ? "0" : parts.hour);
  const localAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second),
  );
  return localAsUtc - date.getTime();
}

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

export function localDateTimeToUtc(input: { value: string; timezone: string }) {
  const parsed = parseLocalDateTimeValue(input.value);
  if (parsed instanceof Date) return parsed;

  const localAsUtc = Date.UTC(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    parsed.hour,
    parsed.minute,
    parsed.second,
  );
  let utc = localAsUtc - getTimezoneOffsetMs(new Date(localAsUtc), input.timezone);
  utc = localAsUtc - getTimezoneOffsetMs(new Date(utc), input.timezone);
  return new Date(utc);
}

export function utcToLocalDateTime(input: { date: Date; timezone: string }) {
  if (!(input.date instanceof Date) || Number.isNaN(input.date.getTime())) {
    throw new Error("Date must be valid.");
  }
  const parts = getDateParts(input.date, input.timezone);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeAvailabilityTimezone(input.timezone),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const timeParts = Object.fromEntries(
    formatter.formatToParts(input.date).map((part) => [part.type, part.value]),
  );
  const hour = Number(timeParts.hour === "24" ? "0" : timeParts.hour);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(hour)}:${pad(
    Number(timeParts.minute),
  )}`;
}

export function getWeekdayInTimezone(date: Date, timezone: string) {
  return getDateParts(date, timezone).weekday;
}

function isSameLocalDate(a: DateParts, b: DateParts) {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function doesTimeRangeOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  assertValidRange(aStart, aEnd);
  assertValidRange(bStart, bEnd);
  return aStart < bEnd && bStart < aEnd;
}

export function isWithinWeeklyAvailability(
  startAt: Date,
  endAt: Date,
  availabilityRule: WeeklyAvailabilityRule,
) {
  assertValidRange(startAt, endAt);
  if (availabilityRule.status !== "ACTIVE") return false;

  const timezone = normalizeAvailabilityTimezone(availabilityRule.timezone);
  const start = getDateParts(startAt, timezone);
  const end = getDateParts(endAt, timezone);

  if (!isSameLocalDate(start, end)) return false;
  if (start.weekday !== availabilityRule.weekday) return false;

  const slotStart = parseTimeToMinutes(availabilityRule.startTime);
  const slotEnd = parseTimeToMinutes(availabilityRule.endTime);
  if (slotStart >= slotEnd) return false;

  return start.minutes >= slotStart && end.minutes <= slotEnd;
}

export function isTeacherBlockedByUnavailablePeriod(
  startAt: Date,
  endAt: Date,
  unavailablePeriods: Array<{ startAt: Date; endAt: Date }>,
) {
  assertValidRange(startAt, endAt);
  return unavailablePeriods.some((period) =>
    doesTimeRangeOverlap(startAt, endAt, period.startAt, period.endAt),
  );
}
