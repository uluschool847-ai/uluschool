import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getTeacherAvailabilityPortalDataMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/teacher-availability-repository", () => ({
  getTeacherAvailabilityPortalData: getTeacherAvailabilityPortalDataMock,
}));

type TeacherAvailabilityPortalPageModule = {
  default: () => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/teacher/availability/page.tsx";

async function loadTeacherAvailabilityPortalPage() {
  const specifier = "@/app/portal/teacher/availability/page";
  return import(/* @vite-ignore */ specifier) as Promise<TeacherAvailabilityPortalPageModule>;
}

function expectEnumTeacherGuardSource() {
  const source = readFileSync(PAGE_SOURCE_PATH, "utf8");
  expect(source).toContain("requireRole([UserRole.TEACHER])");
  expect(source).not.toContain('requireRole(["TEACHER"])');
  expect(source).not.toContain("requireRole(['TEACHER'])");
}

const portalAvailabilityData = {
  teacher: {
    id: "teacher-1",
    name: "Jane Teacher",
    email: "jane.teacher@example.com",
    role: UserRole.TEACHER,
  },
  rules: [
    {
      id: "rule-1",
      teacherId: "teacher-1",
      weekday: 1,
      startTime: "09:00",
      endTime: "12:00",
      timezone: "Africa/Nairobi",
      status: "ACTIVE",
      managedBy: "ADMIN",
    },
  ],
  unavailablePeriods: [
    {
      id: "period-1",
      teacherId: "teacher-1",
      startAt: new Date("2026-06-10T09:00:00.000Z"),
      endAt: new Date("2026-06-10T12:00:00.000Z"),
      reason: "Exam board meeting",
      createdAt: new Date("2026-06-01T09:00:00.000Z"),
      updatedAt: new Date("2026-06-02T09:30:00.000Z"),
    },
    {
      id: "period-past",
      teacherId: "teacher-1",
      startAt: new Date("2026-05-01T09:00:00.000Z"),
      endAt: new Date("2026-05-01T10:00:00.000Z"),
      reason: "Past conference",
      createdAt: new Date("2026-04-20T09:00:00.000Z"),
      updatedAt: new Date("2026-04-21T09:30:00.000Z"),
    },
  ],
  upcomingLessons: [
    {
      id: "lesson-1",
      title: "Algebra lesson",
      startAt: new Date("2026-06-10T09:30:00.000Z"),
      endAt: new Date("2026-06-10T10:30:00.000Z"),
      status: "SCHEDULED",
      classGroup: { id: "group-1", name: "IGCSE Mathematics Group A" },
      conflict: {
        type: "UNAVAILABLE_PERIOD",
        periodId: "period-1",
        reason: "Exam board meeting",
      },
    },
  ],
  conflicts: [
    {
      lessonId: "lesson-outside",
      title: "Outside weekly slot",
      reason: "OUTSIDE_AVAILABILITY",
      startAt: new Date("2026-06-11T06:00:00.000Z"),
      endAt: new Date("2026-06-11T07:00:00.000Z"),
    },
    {
      lessonId: "lesson-1",
      title: "Algebra lesson",
      reason: "UNAVAILABLE_PERIOD",
      startAt: new Date("2026-06-10T09:30:00.000Z"),
      endAt: new Date("2026-06-10T10:30:00.000Z"),
    },
    {
      lessonId: "lesson-booked",
      title: "Double booked lesson",
      reason: "ALREADY_BOOKED",
      startAt: new Date("2026-06-12T09:00:00.000Z"),
      endAt: new Date("2026-06-12T10:00:00.000Z"),
    },
  ],
};

describe("Teacher portal availability page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
  });

  afterEach(() => {
    cleanup();
  });

  it("requires an authenticated TEACHER and loads only the signed-in teacher availability", async () => {
    getTeacherAvailabilityPortalDataMock.mockResolvedValueOnce(portalAvailabilityData);

    const page = await loadTeacherAvailabilityPortalPage();
    render(await page.default());

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(getTeacherAvailabilityPortalDataMock).toHaveBeenCalledWith("teacher-1");
    expect(screen.getByRole("heading", { name: /availability/i })).toBeDefined();
    expect(screen.getByText(/jane teacher/i)).toBeDefined();
    expect(screen.getByText(/jane\.teacher@example\.com/i)).toBeDefined();
    expect(screen.getByText(/monday|mon/i)).toBeDefined();
    expect(screen.getByText(/09:00/)).toBeDefined();
    expect(screen.getAllByText(/12:00/).length).toBeGreaterThan(0);
    expect(screen.getByText(/europe\/kiev/i)).toBeDefined();
    expect(screen.getAllByText(/exam board meeting/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/other teacher/i)).toBeNull();
  });

  it("uses the enum-based server-side TEACHER page guard", () => {
    expectEnumTeacherGuardSource();
  });

  it("lets an active teacher render availability through the page guard", async () => {
    getTeacherAvailabilityPortalDataMock.mockResolvedValueOnce(portalAvailabilityData);

    const page = await loadTeacherAvailabilityPortalPage();
    render(await page.default());

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(getTeacherAvailabilityPortalDataMock).toHaveBeenCalledWith("teacher-1");
    expect(screen.getByRole("heading", { name: /availability/i })).toBeDefined();
  });

  it("shows admin-managed weekly availability as read-only", async () => {
    getTeacherAvailabilityPortalDataMock.mockResolvedValueOnce(portalAvailabilityData);

    const page = await loadTeacherAvailabilityPortalPage();
    render(await page.default());

    const weeklySection =
      screen.getByRole("region", { name: /weekly availability/i }) ??
      screen.getByText(/weekly availability/i).closest("section") ??
      document.body;
    expect(
      within(weeklySection as HTMLElement).getByText(/admin-managed|managed by admin/i),
    ).toBeDefined();
    expect(
      within(weeklySection as HTMLElement).queryByRole("button", { name: /add|edit|delete/i }),
    ).toBeNull();
    expect(
      within(weeklySection as HTMLElement).queryByRole("textbox", { name: /start|end|time/i }),
    ).toBeNull();
  });

  it("shows only the signed-in teacher unavailable periods and empty states", async () => {
    getTeacherAvailabilityPortalDataMock.mockResolvedValueOnce({
      ...portalAvailabilityData,
      rules: [],
      unavailablePeriods: [],
      upcomingLessons: [],
      conflicts: [],
    });

    const page = await loadTeacherAvailabilityPortalPage();
    render(await page.default());

    expect(screen.getByText(/no weekly availability|no availability rules/i)).toBeDefined();
    expect(screen.getByText(/no unavailable periods|no blocked periods/i)).toBeDefined();
    expect(screen.getByText(/no upcoming lessons|no lessons scheduled/i)).toBeDefined();
    expect(screen.getByText(/no conflicts|no availability conflicts/i)).toBeDefined();
    expect(screen.queryByText(/another teacher period/i)).toBeNull();
  });

  it("groups unavailable periods, shows period metadata, and exposes read-only safe period controls", async () => {
    getTeacherAvailabilityPortalDataMock.mockResolvedValueOnce(portalAvailabilityData);

    const page = await loadTeacherAvailabilityPortalPage();
    render(await page.default());

    expect(screen.getByRole("heading", { name: /upcoming unavailable periods/i })).toBeDefined();
    expect(
      screen.getByRole("heading", { name: /past unavailable periods|past periods/i }),
    ).toBeDefined();
    expect(screen.getByText(/exam board meeting/i)).toBeDefined();
    expect(screen.getByText(/past conference/i)).toBeDefined();
    expect(screen.getAllByText(/europe\/kiev/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/created/i)).toBeDefined();
    expect(screen.getByText(/updated/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /edit unavailable period|edit/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /delete unavailable period|delete/i })).toBeDefined();
    expect(
      screen.getByRole("button", { name: /add unavailable period|create unavailable period/i }),
    ).toBeDefined();
  });

  it("renders a conflict summary with stable reasons and teacher route links", async () => {
    getTeacherAvailabilityPortalDataMock.mockResolvedValueOnce(portalAvailabilityData);

    const page = await loadTeacherAvailabilityPortalPage();
    render(await page.default());

    expect(screen.getByRole("heading", { name: /conflicts/i })).toBeDefined();
    expect(screen.getByText(/outside weekly availability/i)).toBeDefined();
    expect(screen.getAllByText(/unavailable period/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/already booked|overlap/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /schedule/i })).toHaveAttribute(
      "href",
      "/portal/teacher/schedule",
    );
    expect(screen.getByRole("link", { name: /algebra lesson|lesson details/i })).toHaveAttribute(
      "href",
      "/portal/teacher/lessons/lesson-1",
    );
    expect(screen.queryByRole("link", { name: /portal schedule/i })).toBeNull();
  });

  it("shows upcoming lessons that may conflict with unavailable periods", async () => {
    getTeacherAvailabilityPortalDataMock.mockResolvedValueOnce(portalAvailabilityData);

    const page = await loadTeacherAvailabilityPortalPage();
    render(await page.default());

    expect(screen.getByText(/algebra lesson/i)).toBeDefined();
    expect(screen.getByText(/igcse mathematics group a/i)).toBeDefined();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/conflict|unavailable|exam board meeting/i);
  });

  it.each([UserRole.STUDENT, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s sessions at the availability page guard",
    async (role) => {
      requireRoleMock.mockRejectedValueOnce(new Error(`NEXT_REDIRECT:${role}`));

      const page = await loadTeacherAvailabilityPortalPage();

      await expect(page.default()).rejects.toThrow(`NEXT_REDIRECT:${role}`);
      expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
      expect(getTeacherAvailabilityPortalDataMock).not.toHaveBeenCalled();
    },
  );

  it("treats invalid or role-changed sessions as requireRole failures before availability data loads", async () => {
    requireRoleMock.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/portal/login?reason=invalid"));
    const page = await loadTeacherAvailabilityPortalPage();

    await expect(page.default()).rejects.toThrow("NEXT_REDIRECT:/portal/login?reason=invalid");
    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(getTeacherAvailabilityPortalDataMock).not.toHaveBeenCalled();
  });
});
