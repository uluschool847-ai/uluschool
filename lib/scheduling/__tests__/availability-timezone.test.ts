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
  it("converts datetime-local values in Europe/Kiev to the correct UTC instant", async () => {
    const { localDateTimeToUtc } = await loadAvailabilityTimezoneHelpers();

    const utc = localDateTimeToUtc({
      value: "2026-05-20T10:00",
      timezone: "Europe/Kiev",
    });

    expect(utc).toBeInstanceOf(Date);
    expect(utc.toISOString()).toBe("2026-05-20T07:00:00.000Z");
    expect(utc.toISOString()).not.toBe("2026-05-20T10:00:00.000Z");
  });

  it("round-trips UTC back to the displayed local datetime-local value", async () => {
    const { utcToLocalDateTime } = await loadAvailabilityTimezoneHelpers();

    expect(
      utcToLocalDateTime({
        date: new Date("2026-05-20T07:00:00.000Z"),
        timezone: "Europe/Kiev",
      }),
    ).toBe("2026-05-20T10:00");
  });

  it("calculates weekday in the teacher timezone rather than server UTC", async () => {
    const { getWeekdayInTimezone } = await loadAvailabilityTimezoneHelpers();

    const utcSundayButKievMonday = new Date("2026-05-17T21:30:00.000Z");

    expect(utcSundayButKievMonday.getUTCDay()).toBe(0);
    expect(getWeekdayInTimezone(utcSundayButKievMonday, "Europe/Kiev")).toBe(1);
  });

  it("falls back safely to Europe/Kiev for invalid timezones", async () => {
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

  it("handles Europe/Kiev DST offsets without shifting the intended local hour", async () => {
    const { localDateTimeToUtc, utcToLocalDateTime } = await loadAvailabilityTimezoneHelpers();

    const winter = localDateTimeToUtc({
      value: "2026-01-20T10:00",
      timezone: "Europe/Kiev",
    });
    const summer = localDateTimeToUtc({
      value: "2026-05-20T10:00",
      timezone: "Europe/Kiev",
    });
    const dstTransitionDay = localDateTimeToUtc({
      value: "2026-03-29T10:00",
      timezone: "Europe/Kiev",
    });

    expect(winter.toISOString()).toBe("2026-01-20T08:00:00.000Z");
    expect(summer.toISOString()).toBe("2026-05-20T07:00:00.000Z");
    expect(dstTransitionDay.toISOString()).toBe("2026-03-29T07:00:00.000Z");
    expect(utcToLocalDateTime({ date: dstTransitionDay, timezone: "Europe/Kiev" })).toBe(
      "2026-03-29T10:00",
    );
  });
});
