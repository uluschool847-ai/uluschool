import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const findUserByIdMock = vi.hoisted(() => vi.fn());
const getLinkedParentsMock = vi.hoisted(() => vi.fn());
const getEnrolledClassesMock = vi.hoisted(() => vi.fn());
const getStudentProfileMock = vi.hoisted(() => vi.fn());
const getStudentProgressMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/user-repository", () => ({
  findUserById: findUserByIdMock,
  getStudentProfile: getStudentProfileMock,
}));

vi.mock("@/lib/repositories/portal-repository", () => ({
  getLinkedParents: getLinkedParentsMock,
  getEnrolledClasses: getEnrolledClassesMock,
  getStudentProgress: getStudentProgressMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

type StudentDetailPageModule = {
  default: (props: {
    params: Promise<{ id: string }> | { id: string };
  }) => Promise<JSX.Element> | JSX.Element;
};

async function loadStudentDetailPage() {
  const specifier = "@/app/(admin)/admin/students/[id]/page";
  return import(/* @vite-ignore */ specifier) as Promise<StudentDetailPageModule>;
}

describe("Admin student detail page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
  });

  afterEach(() => {
    cleanup();
  });

  it("requires ADMIN and renders the student profile, relations, submissions, and progress", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "student-1",
      email: "alice.student@example.com",
      fullName: "Alice Student",
      phoneWhatsapp: "+254700000000",
      role: "STUDENT",
      isActive: true,
      learningStatus: "PAUSED",
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });
    getLinkedParentsMock.mockResolvedValueOnce([
      {
        id: "parent-1",
        fullName: "Inactive Parent",
        email: "inactive.parent@example.com",
      },
    ]);
    getEnrolledClassesMock.mockResolvedValueOnce([
      {
        id: "class-1",
        title: "Mathematics 8A",
        startAt: new Date("2026-05-06T09:00:00.000Z"),
        teacher: { id: "teacher-1", fullName: "Jane Doe" },
      },
      {
        id: "class-2",
        title: "Physics 8A",
        startAt: new Date("2026-05-07T11:00:00.000Z"),
        teacher: { id: "teacher-2", fullName: "John Smith" },
      },
    ]);
    getStudentProfileMock.mockResolvedValueOnce({
      student: {
        id: "student-1",
        role: "STUDENT",
        name: "Alice Student",
      },
      enrolledClasses: [
        {
          id: "class-1",
          title: "Mathematics 8A",
        },
      ],
      recentSubmissions: [
        {
          id: "submission-1",
          assignment: {
            id: "assignment-1",
            title: "Homework 1",
          },
        },
      ],
    });
    getStudentProgressMock.mockResolvedValueOnce([
      {
        id: "progress-1",
        gradeLevel: "Year 10",
        teacherNotes: "Strong algebra progress.",
        recordedAt: new Date("2026-05-08T09:00:00.000Z"),
        subject: {
          name: "Mathematics",
        },
      },
    ]);

    const page = await loadStudentDetailPage();
    const element = await page.default({
      params: Promise.resolve({ id: "student-1" }),
    });

    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(findUserByIdMock).toHaveBeenCalledWith("student-1");
    expect(getLinkedParentsMock).toHaveBeenCalledWith("student-1");
    expect(getEnrolledClassesMock).toHaveBeenCalledWith("student-1");
    expect(getStudentProfileMock).toHaveBeenCalledWith("student-1");
    expect(getStudentProgressMock).toHaveBeenCalledWith("student-1");

    expect(screen.getByRole("heading", { name: /profile/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /status/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /linked parents/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /enrolled classes/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /derived teachers/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /recent submissions/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /recent progress/i })).toBeDefined();

    expect(screen.getByText(/alice student/i)).toBeDefined();
    expect(screen.getByText(/alice\.student@example\.com/i)).toBeDefined();
    expect(screen.getByText(/\+254700000000/i)).toBeDefined();
    expect(screen.getByText(/^Active$/i)).toBeDefined();
    expect(screen.getByText(/^Paused$/i)).toBeDefined();
    expect(screen.getByText(/inactive parent/i)).toBeDefined();
    expect(screen.getByText(/mathematics 8a/i)).toBeDefined();
    expect(screen.getByText(/physics 8a/i)).toBeDefined();
    expect(screen.getAllByText(/jane doe/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/john smith/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/homework 1/i)).toBeDefined();
    expect(screen.getAllByText(/mathematics/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/strong algebra progress/i)).toBeDefined();
    expect(screen.getByText(/year 10/i)).toBeDefined();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: /save changes|update student|create student|link parent|unlink parent|enroll class|unenroll class|delete student/i,
      }),
    ).toBeNull();
  });

  it("renders safe empty states when the student has no parents, classes, submissions, or progress", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "student-1",
      email: "alice.student@example.com",
      fullName: "Alice Student",
      phoneWhatsapp: null,
      role: "STUDENT",
      isActive: false,
      learningStatus: "TRIAL",
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });
    getLinkedParentsMock.mockResolvedValueOnce([]);
    getEnrolledClassesMock.mockResolvedValueOnce([]);
    getStudentProfileMock.mockResolvedValueOnce({
      student: {
        id: "student-1",
        role: "STUDENT",
        name: "Alice Student",
      },
      enrolledClasses: [],
      recentSubmissions: [],
    });
    getStudentProgressMock.mockResolvedValueOnce([]);

    const page = await loadStudentDetailPage();
    const element = await page.default({
      params: Promise.resolve({ id: "student-1" }),
    });

    render(element);

    expect(screen.getByText(/^Inactive$/i)).toBeDefined();
    expect(screen.getByText(/no linked parents|no parents linked/i)).toBeDefined();
    expect(screen.getByText(/no enrolled classes|no classes linked/i)).toBeDefined();
    expect(screen.getByText(/no recent submissions|no submissions/i)).toBeDefined();
    expect(
      screen.getByText(/no progress reports available yet|no progress reports/i),
    ).toBeDefined();
  });

  it("does not allow non-student targets on the detail route", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "teacher-1",
      email: "teacher@example.com",
      fullName: "Teacher User",
      phoneWhatsapp: "+254711111111",
      role: "TEACHER",
      isActive: true,
    });

    const page = await loadStudentDetailPage();

    await expect(
      page.default({
        params: Promise.resolve({ id: "teacher-1" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });
});
