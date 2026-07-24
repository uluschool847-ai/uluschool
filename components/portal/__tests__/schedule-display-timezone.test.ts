import { afterEach, describe, expect, it, vi } from "vitest";

import { formatDateTimeRange, getMonthRange } from "@/components/portal/schedule-display";

describe("portal schedule Nairobi time", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds selected month boundaries from Africa/Nairobi calendar time", () => {
    const range = getMonthRange("2026-01");

    expect(range.from.toISOString()).toBe("2025-12-31T21:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-01-31T20:59:59.999Z");
    expect(range.value).toBe("2026-01");
  });

  it("chooses the default month from the current Nairobi date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-31T21:30:00.000Z"));

    expect(getMonthRange().value).toBe("2026-02");
  });

  it("formats lesson instants in Africa/Nairobi independently of the server timezone", () => {
    expect(
      formatDateTimeRange({
        startAt: new Date("2026-01-15T07:00:00.000Z"),
        endAt: new Date("2026-01-15T08:00:00.000Z"),
      }),
    ).toBe("15 Jan 2026 10:00 - 11:00");
  });
});
