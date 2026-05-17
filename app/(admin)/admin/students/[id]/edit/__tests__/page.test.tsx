import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const findUserByIdMock = vi.hoisted(() => vi.fn());
const getLinkedParentsMock = vi.hoisted(() => vi.fn());
const getEnrolledClassesMock = vi.hoisted(() => vi.fn());
const listUsersByRoleMock = vi.hoisted(() => vi.fn());
const listAvailableClassesForStudentEnrollmentMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
const studentFormMock = vi.hoisted(() => vi.fn());
const studentParentLinksMock = vi.hoisted(() => vi.fn());
const studentClassEnrollmentsMock = vi.hoisted(() => vi.fn());
const studentStatusControlMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/user-repository", () => ({
  findUserById: findUserByIdMock,
  listUsersByRole: listUsersByRoleMock,
}));

vi.mock("@/lib/repositories/portal-repository", () => ({
  getLinkedParents: getLinkedParentsMock,
  getEnrolledClasses: getEnrolledClassesMock,
  listAvailableClassesForStudentEnrollment: listAvailableClassesForStudentEnrollmentMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

vi.mock("@/components/admin/students/StudentForm", () => ({
  StudentForm: (props: unknown) => {
    studentFormMock(props);
    return <div data-testid="student-form" />;
  },
}));

vi.mock("@/components/admin/students/StudentParentLinks", () => ({
  StudentParentLinks: (props: unknown) => {
    studentParentLinksMock(props);
    return <div data-testid="student-parent-links" />;
  },
}));

vi.mock("@/components/admin/students/StudentClassEnrollments", () => ({
  StudentClassEnrollments: (props: unknown) => {
    studentClassEnrollmentsMock(props);
    return <div data-testid="student-class-enrollments" />;
  },
}));

vi.mock("@/components/admin/students/StudentStatusControl", () => ({
  StudentStatusControl: (props: unknown) => {
    studentStatusControlMock(props);
    return <div data-testid="student-status-control" />;
  },
}));

type StudentFormProps = {
  mode: "create" | "edit";
  flashMessage?: string;
  flashError?: string;
  successRedirect: string;
  errorRedirect: string;
  student?: {
    id: string;
    fullName: string;
    email: string;
    phoneWhatsapp?: string | null;
    isActive?: boolean;
    learningStatus?: "TRIAL" | "ACTIVE" | "PAUSED" | "INACTIVE";
  };
};

type StudentParentLinksProps = {
  studentId: string;
  linkedParents: Array<{
    id: string;
    fullName: string;
    email: string | null;
  }>;
  availableParents: Array<{
    id: string;
    fullName: string;
    email: string | null;
  }>;
  flashMessage?: string;
  flashError?: string;
};

type StudentClassEnrollmentsProps = {
  studentId: string;
  enrolledClasses: Array<{
    id: string;
    title: string;
    startAt: Date;
    teacher: { id: string; fullName: string } | null;
  }>;
  availableClasses: Array<{
    id: string;
    title: string;
    startAt: Date;
    teacher: { id: string; fullName: string } | null;
  }>;
  preferredClassId?: string;
  flashMessage?: string;
  flashError?: string;
};

type StudentStatusControlProps = {
  studentId: string;
  currentStatus: "TRIAL" | "ACTIVE" | "PAUSED" | "INACTIVE";
  accountIsActive: boolean;
  flashMessage?: string;
  flashError?: string;
};

type StudentEditPageModule = {
  default: (props: {
    params: Promise<{ id: string }> | { id: string };
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<JSX.Element> | JSX.Element;
};

async function loadStudentEditPage() {
  const specifier = "@/app/(admin)/admin/students/[id]/edit/page";
  return import(/* @vite-ignore */ specifier) as Promise<StudentEditPageModule>;
}

describe("Admin student account edit page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
  });

  afterEach(() => {
    cleanup();
  });

  it("requires ADMIN role and pre-fills the student form with an existing student account", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "student-1",
      email: "alice.student@example.com",
      fullName: "Alice Student",
      phoneWhatsapp: "+254700000000",
      role: "STUDENT",
      isActive: true,
      learningStatus: "TRIAL",
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });
    getLinkedParentsMock.mockResolvedValueOnce([
      {
        id: "parent-inactive",
        fullName: "Inactive Parent",
        email: "inactive.parent@example.com",
      },
    ]);
    listUsersByRoleMock.mockResolvedValueOnce([
      {
        id: "parent-1",
        fullName: "Mary Parent",
        email: "mary.parent@example.com",
        phoneWhatsapp: "+254700000001",
      },
      {
        id: "parent-2",
        fullName: "John Parent",
        email: "john.parent@example.com",
        phoneWhatsapp: "+254700000002",
      },
    ]);
    getEnrolledClassesMock.mockResolvedValueOnce([
      {
        id: "class-1",
        title: "Mathematics 8A",
        startAt: new Date("2026-05-06T09:00:00.000Z"),
        teacher: {
          id: "teacher-1",
          fullName: "Jane Doe",
        },
      },
    ]);
    listAvailableClassesForStudentEnrollmentMock.mockResolvedValueOnce([
      {
        id: "class-2",
        title: "Physics 8A",
        startAt: new Date("2026-05-07T11:00:00.000Z"),
        teacher: {
          id: "teacher-2",
          fullName: "John Smith",
        },
      },
    ]);

    const page = await loadStudentEditPage();
    const element = await page.default({
      params: Promise.resolve({ id: "student-1" }),
      searchParams: Promise.resolve({
        studentMessage: "Student account updated.",
        classId: "class-2",
      }),
    });

    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(findUserByIdMock).toHaveBeenCalledWith("student-1");
    expect(screen.getByTestId("student-form")).toBeDefined();

    const props = studentFormMock.mock.calls[0]?.[0] as StudentFormProps;
    expect(props).toEqual(
      expect.objectContaining({
        mode: "edit",
        successRedirect: "/admin/students",
        errorRedirect: "/admin/students/student-1/edit",
        flashMessage: "Student account updated.",
        student: expect.objectContaining({
          id: "student-1",
          fullName: "Alice Student",
          email: "alice.student@example.com",
          phoneWhatsapp: "+254700000000",
          learningStatus: "TRIAL",
        }),
      }),
    );
    expect(props).not.toHaveProperty("role");

    expect(listUsersByRoleMock).toHaveBeenCalledWith(UserRole.PARENT);
    expect(getEnrolledClassesMock).toHaveBeenCalledWith("student-1");
    expect(listAvailableClassesForStudentEnrollmentMock).toHaveBeenCalledWith("student-1");
    expect(screen.getByTestId("student-parent-links")).toBeDefined();
    expect(screen.getByTestId("student-class-enrollments")).toBeDefined();
    expect(screen.getByTestId("student-status-control")).toBeDefined();

    const statusProps = studentStatusControlMock.mock.calls[0]?.[0] as StudentStatusControlProps;
    expect(statusProps).toEqual(
      expect.objectContaining({
        studentId: "student-1",
        currentStatus: "TRIAL",
        accountIsActive: true,
        flashMessage: "Student account updated.",
      }),
    );

    const parentLinkProps = studentParentLinksMock.mock.calls[0]?.[0] as StudentParentLinksProps;
    expect(parentLinkProps).toEqual(
      expect.objectContaining({
        studentId: "student-1",
        linkedParents: [
          expect.objectContaining({
            id: "parent-inactive",
            fullName: "Inactive Parent",
            email: "inactive.parent@example.com",
          }),
        ],
        availableParents: expect.arrayContaining([
          expect.objectContaining({
            id: "parent-inactive",
            fullName: "Inactive Parent",
            email: "inactive.parent@example.com",
          }),
          expect.objectContaining({
            id: "parent-1",
            fullName: "Mary Parent",
            email: "mary.parent@example.com",
          }),
          expect.objectContaining({
            id: "parent-2",
            fullName: "John Parent",
            email: "john.parent@example.com",
          }),
        ]),
        flashMessage: "Student account updated.",
      }),
    );

    const classEnrollmentProps = studentClassEnrollmentsMock.mock
      .calls[0]?.[0] as StudentClassEnrollmentsProps;
    expect(classEnrollmentProps).toEqual(
      expect.objectContaining({
        studentId: "student-1",
        enrolledClasses: [
          expect.objectContaining({
            id: "class-1",
            title: "Mathematics 8A",
            startAt: expect.any(Date),
            teacher: expect.objectContaining({
              id: "teacher-1",
              fullName: "Jane Doe",
            }),
          }),
        ],
        availableClasses: expect.arrayContaining([
          expect.objectContaining({
            id: "class-2",
            title: "Physics 8A",
          }),
        ]),
        preferredClassId: "class-2",
        flashMessage: "Student account updated.",
      }),
    );
  });

  it("does not allow editing non-student accounts", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "teacher-1",
      email: "teacher@example.com",
      fullName: "Teacher User",
      phoneWhatsapp: "+254711111111",
      role: "TEACHER",
      isActive: true,
    });

    const page = await loadStudentEditPage();

    await expect(
      page.default({
        params: Promise.resolve({ id: "teacher-1" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });

  it("forwards flash errors into the edit form", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "student-1",
      email: "alice.student@example.com",
      fullName: "Alice Student",
      phoneWhatsapp: "+254700000000",
      role: "STUDENT",
      isActive: false,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });
    getLinkedParentsMock.mockResolvedValueOnce([]);
    listUsersByRoleMock.mockResolvedValueOnce([]);
    getEnrolledClassesMock.mockResolvedValueOnce([]);
    listAvailableClassesForStudentEnrollmentMock.mockResolvedValueOnce([]);

    const page = await loadStudentEditPage();
    const element = await page.default({
      params: Promise.resolve({ id: "student-1" }),
      searchParams: Promise.resolve({ studentError: "Student account failed." }),
    });

    render(element);

    const props = studentFormMock.mock.calls[0]?.[0] as StudentFormProps;
    expect(props).toEqual(
      expect.objectContaining({
        mode: "edit",
        flashError: "Student account failed.",
      }),
    );

    const parentLinkProps = studentParentLinksMock.mock.calls[0]?.[0] as StudentParentLinksProps;
    expect(parentLinkProps).toEqual(
      expect.objectContaining({
        linkedParents: [],
        availableParents: [],
        flashError: "Student account failed.",
      }),
    );

    const classEnrollmentProps = studentClassEnrollmentsMock.mock
      .calls[0]?.[0] as StudentClassEnrollmentsProps;
    expect(classEnrollmentProps).toEqual(
      expect.objectContaining({
        enrolledClasses: [],
        availableClasses: [],
        flashError: "Student account failed.",
      }),
    );
    expect(getEnrolledClassesMock).toHaveBeenCalledWith("student-1");
    expect(listAvailableClassesForStudentEnrollmentMock).toHaveBeenCalledWith("student-1");
  });

  it("shows an empty state for students with no linked parents", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "student-1",
      email: "alice.student@example.com",
      fullName: "Alice Student",
      phoneWhatsapp: "+254700000000",
      role: "STUDENT",
      isActive: false,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });
    getLinkedParentsMock.mockResolvedValueOnce([]);
    listUsersByRoleMock.mockResolvedValueOnce([
      {
        id: "parent-1",
        fullName: "Mary Parent",
        email: "mary.parent@example.com",
        phoneWhatsapp: "+254700000001",
      },
    ]);
    getEnrolledClassesMock.mockResolvedValueOnce([]);
    listAvailableClassesForStudentEnrollmentMock.mockResolvedValueOnce([
      {
        id: "class-1",
        title: "Mathematics 8A",
        startAt: new Date("2026-05-06T09:00:00.000Z"),
        teacher: {
          id: "teacher-1",
          fullName: "Jane Doe",
        },
      },
    ]);

    const page = await loadStudentEditPage();
    const element = await page.default({
      params: Promise.resolve({ id: "student-1" }),
    });

    render(element);

    const parentLinkProps = studentParentLinksMock.mock.calls[0]?.[0] as StudentParentLinksProps;
    expect(parentLinkProps).toEqual(
      expect.objectContaining({
        studentId: "student-1",
        linkedParents: [],
      }),
    );
    expect(listUsersByRoleMock).toHaveBeenCalledWith(UserRole.PARENT);
    expect(getEnrolledClassesMock).toHaveBeenCalledWith("student-1");
    expect(listAvailableClassesForStudentEnrollmentMock).toHaveBeenCalledWith("student-1");

    const classEnrollmentProps = studentClassEnrollmentsMock.mock
      .calls[0]?.[0] as StudentClassEnrollmentsProps;
    expect(classEnrollmentProps).toEqual(
      expect.objectContaining({
        studentId: "student-1",
        enrolledClasses: [],
        availableClasses: expect.arrayContaining([
          expect.objectContaining({
            id: "class-1",
            title: "Mathematics 8A",
            teacher: expect.objectContaining({
              id: "teacher-1",
              fullName: "Jane Doe",
            }),
          }),
        ]),
      }),
    );
  });
});
