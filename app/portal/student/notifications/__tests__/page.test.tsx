import { readFileSync } from "node:fs";
import { NotificationType, UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listNotificationsForUserMock = vi.hoisted(() => vi.fn());
const getNotificationPreferenceMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ requireRole: requireRoleMock }));
vi.mock("@/lib/repositories/notification-repository", () => ({
  getNotificationPreference: getNotificationPreferenceMock,
  listNotificationsForUser: listNotificationsForUserMock,
}));
vi.mock("@/app/portal/actions/notification-actions", () => ({
  markNotificationReadAction: vi.fn(),
  updateNotificationPreferencesAction: vi.fn(),
}));

type StudentNotificationsPageModule = {
  default: (props: {
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<ReactElement> | ReactElement;
};

function loadStudentNotificationsPage() {
  return import(
    "@/app/portal/student/notifications/page"
  ) as Promise<StudentNotificationsPageModule>;
}

describe("Student notifications page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "student-1", role: UserRole.STUDENT });
    listNotificationsForUserMock.mockResolvedValue([
      {
        body: "Your lesson starts soon.",
        createdAt: new Date("2026-06-01T09:00:00.000Z"),
        deliveryStatus: "SENT",
        details: "Algebra Group A",
        id: "notification-1",
        isRead: false,
        readAt: null,
        relatedHref: "/portal/student/schedule",
        title: "Upcoming lesson",
        type: NotificationType.LESSON_REMINDER,
      },
    ]);
    getNotificationPreferenceMock.mockResolvedValue({
      emailEnabled: true,
      whatsappEnabled: false,
    });
  });

  afterEach(() => cleanup());

  it("uses STUDENT guard, repository-driven data, and no direct Prisma query", () => {
    const source = readFileSync("app/portal/student/notifications/page.tsx", "utf8");

    expect(source).toContain("requireRole([UserRole.STUDENT])");
    expect(source).toContain("@/lib/repositories/notification-repository");
    expect(source).toContain("listNotificationsForUser(session.uid");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
  });

  it("uses the signed-in student id and sanitizes notification filters", async () => {
    const page = await loadStudentNotificationsPage();
    const element = await page.default({
      searchParams: {
        status: "unread",
        studentId: "spoofed-student",
        type: NotificationType.LESSON_REMINDER,
      },
    });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.STUDENT]);
    expect(listNotificationsForUserMock).toHaveBeenCalledWith("student-1", {
      status: "unread",
      type: NotificationType.LESSON_REMINDER,
    });
    expect(getNotificationPreferenceMock).toHaveBeenCalledWith("student-1");
    expect(screen.getByRole("heading", { name: /student notifications/i })).toBeDefined();
    expect(screen.getByText(/upcoming lesson/i)).toBeDefined();
    expect(screen.getByText(/your lesson starts soon/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /back to dashboard/i })).toHaveAttribute(
      "href",
      "/portal/student",
    );
    expect(screen.getByRole("link", { name: /open related item/i })).toHaveAttribute(
      "href",
      "/portal/student/schedule",
    );
    expect((screen.getByLabelText(/email reminders/i) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/whatsapp reminders/i) as HTMLInputElement).checked).toBe(false);
  });

  it("renders empty state with preferences when the student has no notifications", async () => {
    listNotificationsForUserMock.mockResolvedValueOnce([]);
    getNotificationPreferenceMock.mockResolvedValueOnce({
      emailEnabled: false,
      whatsappEnabled: true,
    });

    const page = await loadStudentNotificationsPage();
    const element = await page.default({ searchParams: Promise.resolve({}) });
    render(element);

    expect(screen.getByText(/no notifications yet/i)).toBeDefined();
    expect((screen.getByLabelText(/email reminders/i) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText(/whatsapp reminders/i) as HTMLInputElement).checked).toBe(true);
  });

  it.each([UserRole.TEACHER, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s sessions",
    async (role) => {
      requireRoleMock.mockRejectedValueOnce(new Error(`NEXT_REDIRECT:${role}`));
      const page = await loadStudentNotificationsPage();

      await expect(page.default({ searchParams: {} })).rejects.toThrow(`NEXT_REDIRECT:${role}`);
      expect(listNotificationsForUserMock).not.toHaveBeenCalled();
      expect(getNotificationPreferenceMock).not.toHaveBeenCalled();
    },
  );
});
