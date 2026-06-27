import { describe, expect, it } from "vitest";

type AvailabilitySlotStatus = "ACTIVE" | "INACTIVE";

type AvailabilityRule = {
  teacherId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  timezone: string;
  status: AvailabilitySlotStatus;
};

type AvailabilityUtilsModule = {
  doesTimeRangeOverlap: (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => boolean;
  isWithinWeeklyAvailability: (
    startAt: Date,
    endAt: Date,
    availabilityRule: AvailabilityRule,
  ) => boolean;
  isTeacherBlockedByUnavailablePeriod: (
    startAt: Date,
    endAt: Date,
    unavailablePeriods: Array<{ startAt: Date; endAt: Date }>,
  ) => boolean;
};

async function loadAvailabilityUtils() {
  const specifier = "@/lib/scheduling/availability";
  return import(/* @vite-ignore */ specifier) as Promise<AvailabilityUtilsModule>;
}

describe("teacher availability scheduling utilities", () => {
  it("detects overlapping and adjacent time ranges", async () => {
    const { doesTimeRangeOverlap } = await loadAvailabilityUtils();

    expect(
      doesTimeRangeOverlap(
        new Date("2026-06-01T10:00:00.000Z"),
        new Date("2026-06-01T11:00:00.000Z"),
        new Date("2026-06-01T11:00:00.000Z"),
        new Date("2026-06-01T12:00:00.000Z"),
      ),
    ).toBe(false);
    expect(
      doesTimeRangeOverlap(
        new Date("2026-06-01T10:00:00.000Z"),
        new Date("2026-06-01T11:00:00.000Z"),
        new Date("2026-06-01T10:00:00.000Z"),
        new Date("2026-06-01T11:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      doesTimeRangeOverlap(
        new Date("2026-06-01T10:00:00.000Z"),
        new Date("2026-06-01T11:00:00.000Z"),
        new Date("2026-06-01T10:30:00.000Z"),
        new Date("2026-06-01T11:30:00.000Z"),
      ),
    ).toBe(true);
  });

  it("rejects invalid ranges where startAt is not before endAt", async () => {
    const {
      doesTimeRangeOverlap,
      isWithinWeeklyAvailability,
      isTeacherBlockedByUnavailablePeriod,
    } = await loadAvailabilityUtils();

    const startAt = new Date("2026-06-01T10:00:00.000Z");
    const endAt = new Date("2026-06-01T10:00:00.000Z");
    const rule = {
      teacherId: "teacher-1",
      weekday: 1,
      startTime: "09:00",
      endTime: "17:00",
      timezone: "Africa/Nairobi",
      status: "ACTIVE" as const,
    };

    expect(() =>
      doesTimeRangeOverlap(startAt, endAt, startAt, new Date("2026-06-01T11:00:00Z")),
    ).toThrow(/start.*before.*end|invalid/i);
    expect(() => isWithinWeeklyAvailability(startAt, endAt, rule)).toThrow(
      /start.*before.*end|invalid/i,
    );
    expect(() => isTeacherBlockedByUnavailablePeriod(startAt, endAt, [])).toThrow(
      /start.*before.*end|invalid/i,
    );
  });

  it("checks whether a lesson fits fully inside an active weekly availability slot", async () => {
    const { isWithinWeeklyAvailability } = await loadAvailabilityUtils();
    const mondayKievRule: AvailabilityRule = {
      teacherId: "teacher-1",
      weekday: 1,
      startTime: "09:00",
      endTime: "12:00",
      timezone: "Africa/Nairobi",
      status: "ACTIVE",
    };

    expect(
      isWithinWeeklyAvailability(
        new Date("2026-06-01T07:00:00.000Z"),
        new Date("2026-06-01T08:00:00.000Z"),
        mondayKievRule,
      ),
    ).toBe(true);
    expect(
      isWithinWeeklyAvailability(
        new Date("2026-06-01T05:30:00.000Z"),
        new Date("2026-06-01T08:30:00.000Z"),
        mondayKievRule,
      ),
    ).toBe(false);
  });

  it("ignores inactive weekly availability rules and treats no active availability as unavailable", async () => {
    const { isWithinWeeklyAvailability } = await loadAvailabilityUtils();

    expect(
      isWithinWeeklyAvailability(
        new Date("2026-06-01T07:00:00.000Z"),
        new Date("2026-06-01T08:00:00.000Z"),
        {
          teacherId: "teacher-1",
          weekday: 1,
          startTime: "09:00",
          endTime: "12:00",
          timezone: "Africa/Nairobi",
          status: "INACTIVE",
        },
      ),
    ).toBe(false);
  });

  it("uses weekday standard 1-7 and Africa/Nairobi timezone for weekly checks", async () => {
    const { isWithinWeeklyAvailability } = await loadAvailabilityUtils();
    const sundayRule: AvailabilityRule = {
      teacherId: "teacher-1",
      weekday: 7,
      startTime: "09:00",
      endTime: "10:00",
      timezone: "Africa/Nairobi",
      status: "ACTIVE",
    };

    expect(
      isWithinWeeklyAvailability(
        new Date("2026-06-07T06:00:00.000Z"),
        new Date("2026-06-07T07:00:00.000Z"),
        sundayRule,
      ),
    ).toBe(true);
    expect(
      isWithinWeeklyAvailability(
        new Date("2026-06-08T06:00:00.000Z"),
        new Date("2026-06-08T07:00:00.000Z"),
        sundayRule,
      ),
    ).toBe(false);
  });

  it("detects unavailable periods that exactly or partially overlap a lesson", async () => {
    const { isTeacherBlockedByUnavailablePeriod } = await loadAvailabilityUtils();
    const periods = [
      {
        startAt: new Date("2026-06-01T10:00:00.000Z"),
        endAt: new Date("2026-06-01T11:00:00.000Z"),
      },
    ];

    expect(
      isTeacherBlockedByUnavailablePeriod(
        new Date("2026-06-01T10:00:00.000Z"),
        new Date("2026-06-01T11:00:00.000Z"),
        periods,
      ),
    ).toBe(true);
    expect(
      isTeacherBlockedByUnavailablePeriod(
        new Date("2026-06-01T10:30:00.000Z"),
        new Date("2026-06-01T11:30:00.000Z"),
        periods,
      ),
    ).toBe(true);
    expect(
      isTeacherBlockedByUnavailablePeriod(
        new Date("2026-06-01T11:00:00.000Z"),
        new Date("2026-06-01T12:00:00.000Z"),
        periods,
      ),
    ).toBe(false);
  });

  it.each([
    {
      label: "lesson fully inside unavailable period",
      startAt: "2026-06-01T10:15:00.000Z",
      endAt: "2026-06-01T10:45:00.000Z",
    },
    {
      label: "lesson starts before period and ends inside",
      startAt: "2026-06-01T09:30:00.000Z",
      endAt: "2026-06-01T10:30:00.000Z",
    },
    {
      label: "lesson starts inside period and ends after",
      startAt: "2026-06-01T10:30:00.000Z",
      endAt: "2026-06-01T11:30:00.000Z",
    },
    {
      label: "lesson fully covers unavailable period",
      startAt: "2026-06-01T09:30:00.000Z",
      endAt: "2026-06-01T11:30:00.000Z",
    },
  ])("blocks $label", async ({ startAt, endAt }) => {
    const { isTeacherBlockedByUnavailablePeriod } = await loadAvailabilityUtils();
    const periods = [
      {
        startAt: new Date("2026-06-01T10:00:00.000Z"),
        endAt: new Date("2026-06-01T11:00:00.000Z"),
      },
    ];

    expect(isTeacherBlockedByUnavailablePeriod(new Date(startAt), new Date(endAt), periods)).toBe(
      true,
    );
  });

  it("does not block lessons that exactly touch unavailable period boundaries", async () => {
    const { isTeacherBlockedByUnavailablePeriod } = await loadAvailabilityUtils();
    const periods = [
      {
        startAt: new Date("2026-06-01T10:00:00.000Z"),
        endAt: new Date("2026-06-01T11:00:00.000Z"),
      },
    ];

    expect(
      isTeacherBlockedByUnavailablePeriod(
        new Date("2026-06-01T09:00:00.000Z"),
        new Date("2026-06-01T10:00:00.000Z"),
        periods,
      ),
    ).toBe(false);
    expect(
      isTeacherBlockedByUnavailablePeriod(
        new Date("2026-06-01T11:00:00.000Z"),
        new Date("2026-06-01T12:00:00.000Z"),
        periods,
      ),
    ).toBe(false);
  });
});
