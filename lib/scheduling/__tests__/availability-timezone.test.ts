import { describe, expect, it } from "vitest";

type AvailabilityTimezoneModule = {
  localDateTimeToUtc: (input: { value: string; timezone: string }) => Date;
  utcToLocalDateTime: (input: { date: Date; timezone: string }) => string;
  getWeekdayInTimezone: (date: Date, timezone: string) => number;
};

async function loadAvailabilityTimezoneHelpers() {
  const specifier = "@/lib/scheduling/availability";
  return import(/* @vite-ignore */ specifier) as Promise<AvailabilityTimezoneModule>;
}

describe("availability timezone helpers", () => {
  it("converts datetime-local values in Africa/Nairobi to the correct UTC instant", async () => {
    const { localDateTimeToUtc } = await loadAvailabilityTimezoneHelpers();

    const utc = localDateTimeToUtc({
      value: "2026-05-20T10:00",
      timezone: "Africa/Nairobi",
    });

    expect(utc).toBeInstanceOf(Date);
    expect(utc.toISOString()).toBe("2026-05-20T07:00:00.000Z");
    expect(utc.toISOString()).not.toBe("2026-05-20T10:00:00.000Z");
  });

  it("accepts optional seconds and fractional seconds in datetime-local values", async () => {
    const { localDateTimeToUtc } = await loadAvailabilityTimezoneHelpers();

    expect(
      localDateTimeToUtc({
        value: "2026-01-20T10:00:30.250",
        timezone: "Africa/Nairobi",
      }).toISOString(),
    ).toBe("2026-01-20T07:00:30.250Z");
  });

  it.each([
    "2026-01-20T10:00:00Z",
    "2026-01-20T10:00:00+03:00",
    "2026-02-30T10:00",
    "2026-01-20T25:00",
  ])("rejects non-local or impossible datetime-local value %s", async (value) => {
    const { localDateTimeToUtc } = await loadAvailabilityTimezoneHelpers();

    expect(() => localDateTimeToUtc({ value, timezone: "Africa/Nairobi" })).toThrow(
      "Date and time must be valid.",
    );
  });

  it("round-trips UTC back to the displayed local datetime-local value", async () => {
    const { utcToLocalDateTime } = await loadAvailabilityTimezoneHelpers();

    expect(
      utcToLocalDateTime({
        date: new Date("2026-05-20T07:00:00.000Z"),
        timezone: "Africa/Nairobi",
      }),
    ).toBe("2026-05-20T10:00");
  });

  it("calculates weekday in the teacher timezone rather than server UTC", async () => {
    const { getWeekdayInTimezone } = await loadAvailabilityTimezoneHelpers();

    const utcSundayButKievMonday = new Date("2026-05-17T21:30:00.000Z");

    expect(utcSundayButKievMonday.getUTCDay()).toBe(0);
    expect(getWeekdayInTimezone(utcSundayButKievMonday, "Africa/Nairobi")).toBe(1);
  });

  it("falls back safely to Africa/Nairobi for invalid timezones", async () => {
    const { localDateTimeToUtc, utcToLocalDateTime, getWeekdayInTimezone } =
      await loadAvailabilityTimezoneHelpers();

    expect(
      localDateTimeToUtc({
        value: "2026-05-20T10:00",
        timezone: "Invalid/Timezone",
      }).toISOString(),
    ).toBe("2026-05-20T07:00:00.000Z");
    expect(
      utcToLocalDateTime({
        date: new Date("2026-05-20T07:00:00.000Z"),
        timezone: "Invalid/Timezone",
      }),
    ).toBe("2026-05-20T10:00");
    expect(getWeekdayInTimezone(new Date("2026-05-17T21:30:00.000Z"), "Invalid/Timezone")).toBe(1);
  });

  it("handles Africa/Nairobi fixed offsets without shifting the intended local hour", async () => {
    const { localDateTimeToUtc, utcToLocalDateTime } = await loadAvailabilityTimezoneHelpers();

    const winter = localDateTimeToUtc({
      value: "2026-01-20T10:00",
      timezone: "Africa/Nairobi",
    });
    const summer = localDateTimeToUtc({
      value: "2026-05-20T10:00",
      timezone: "Africa/Nairobi",
    });
    const dstTransitionDay = localDateTimeToUtc({
      value: "2026-03-29T10:00",
      timezone: "Africa/Nairobi",
    });

    expect(winter.toISOString()).toBe("2026-01-20T07:00:00.000Z");
    expect(summer.toISOString()).toBe("2026-05-20T07:00:00.000Z");
    expect(dstTransitionDay.toISOString()).toBe("2026-03-29T07:00:00.000Z");
    expect(utcToLocalDateTime({ date: dstTransitionDay, timezone: "Africa/Nairobi" })).toBe(
      "2026-03-29T10:00",
    );
  });
});
