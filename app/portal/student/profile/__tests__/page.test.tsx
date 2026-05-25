import { existsSync, readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getStudentProfileMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/student-profile-repository", () => ({
  getStudentProfile: getStudentProfileMock,
}));

type StudentProfilePageModule = {
  default: (props?: {
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/student/profile/page.tsx";

function loadStudentProfilePage() {
  const specifier = "@/app/portal/student/profile/page";
  return import(/* @vite-ignore */ specifier) as Promise<StudentProfilePageModule>;
}

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: "student-1",
    email: "amina@example.com",
    fullName: "Amina Yusuf",
    role: UserRole.STUDENT,
    learningStatus: "ACTIVE",
    isActive: true,
    createdAt: new Date("2026-01-10T09:00:00.000Z"),
    updatedAt: new Date("2026-05-10T09:00:00.000Z"),
    classGroups: [
      {
        id: "group-1",
        name: "IGCSE Mathematics A",
        subject: { id: "subject-math", name: "Mathematics" },
        teacher: { id: "teacher-1", fullName: "Jane Teacher" },
      },
    ],
    directClasses: [
      {
        id: "lesson-1",
        title: "Direct algebra support",
        subject: { id: "subject-math", name: "Mathematics" },
        teacher: { id: "teacher-1", fullName: "Jane Teacher" },
      },
    ],
    ...overrides,
  };
}

describe("Student profile page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({
      uid: "student-1",
      role: UserRole.STUDENT,
      email: "amina@example.com",
    });
    getStudentProfileMock.mockResolvedValue(profile());
  });

  afterEach(() => cleanup());

  it("uses the STUDENT guard, student profile repository, and no direct Prisma query", () => {
    expect(existsSync(PAGE_SOURCE_PATH), "student profile page should exist").toBe(true);

    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("requireRole([UserRole.STUDENT])");
    expect(source).toContain("getStudentProfile");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
  });

  it("requires STUDENT and loads the profile using session.uid, ignoring query studentId", async () => {
    const page = await loadStudentProfilePage();
    const element = await page.default({ searchParams: { studentId: "foreign-student" } });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.STUDENT]);
    expect(getStudentProfileMock).toHaveBeenCalledWith("student-1");
    expect(getStudentProfileMock).not.toHaveBeenCalledWith("foreign-student");
  });

  it("renders account identity, safe metadata, membership, and dashboard navigation", async () => {
    const page = await loadStudentProfilePage();
    const element = await page.default({ searchParams: {} });
    render(element);

    expect(screen.getByRole("heading", { name: /^profile$/i })).toBeDefined();
    expect(screen.getByText("Amina Yusuf")).toBeDefined();
    expect(screen.getByText("amina@example.com")).toBeDefined();
    expect(screen.getByText(/student/i)).toBeDefined();
    expect(screen.getByText(/active/i)).toBeDefined();
    expect(screen.getByText(/igcse mathematics a/i)).toBeDefined();
    expect(screen.getByText(/direct algebra support/i)).toBeDefined();
    expect(screen.getByText(/mathematics/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /back to dashboard/i })).toHaveAttribute(
      "href",
      "/portal/student",
    );
  });

  it("renders an accessible empty state when the student has no class or group membership", async () => {
    getStudentProfileMock.mockResolvedValueOnce(
      profile({
        classGroups: [],
        directClasses: [],
      }),
    );

    const page = await loadStudentProfilePage();
    const element = await page.default({ searchParams: {} });
    render(element);

    expect(screen.getByRole("status", { name: /class membership/i })).toHaveTextContent(
      /no class or group membership yet/i,
    );
  });

  it.each([UserRole.PARENT, UserRole.TEACHER, UserRole.ADMIN])(
    "rejects %s before loading student profile data",
    async (role) => {
      requireRoleMock.mockRejectedValueOnce(new Error(`NEXT_REDIRECT:${role}`));
      const page = await loadStudentProfilePage();

      await expect(page.default({ searchParams: {} })).rejects.toThrow("NEXT_REDIRECT");
      expect(getStudentProfileMock).not.toHaveBeenCalled();
    },
  );
});
