import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getReportSnapshotForParentMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

vi.mock("@/lib/auth/session", () => ({ requireRole: requireRoleMock }));
vi.mock("@/lib/repositories/report-repository", () => ({
  getReportSnapshotForParent: getReportSnapshotForParentMock,
}));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));

type ParentReportPageModule = {
  default: (props: {
    params:
      | Promise<{ snapshotId: string; studentId: string }>
      | { snapshotId: string; studentId: string };
  }) => Promise<ReactElement> | ReactElement;
};

function loadParentReportPage() {
  const specifier = "@/app/portal/parent/reports/[studentId]/[snapshotId]/page";
  return import(/* @vite-ignore */ specifier) as Promise<ParentReportPageModule>;
}

describe("Parent child report snapshot page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "parent-1", role: UserRole.PARENT });
    getReportSnapshotForParentMock.mockResolvedValue({
      id: "snapshot-1",
      snapshotData: {
        attendance: { present: 8 },
        grades: { weightedTermAverage: 92 },
        academicTerm: { name: "Spring 2026" },
        student: { fullName: "Amina Yusuf" },
      },
      snapshotVersion: 1,
    });
  });

  afterEach(() => cleanup());

  it("uses PARENT guard, linked-child snapshot repository, and no direct Prisma query", () => {
    const source = readFileSync(
      "app/portal/parent/reports/[studentId]/[snapshotId]/page.tsx",
      "utf8",
    );

    expect(source).toContain("requireRole([UserRole.PARENT])");
    expect(source).toContain("@/lib/repositories/report-repository");
    expect(source).toContain("getReportSnapshotForParent(session.uid");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
  });

  it("renders linked child's saved report without teacher mutation controls", async () => {
    const page = await loadParentReportPage();
    const element = await page.default({
      params: { snapshotId: "snapshot-1", studentId: "student-1" },
    });
    render(element);

    expect(getReportSnapshotForParentMock).toHaveBeenCalledWith(
      "parent-1",
      "student-1",
      "snapshot-1",
    );
    expect(screen.getByRole("heading", { name: /report/i })).toBeDefined();
    expect(screen.getByText(/amina yusuf/i)).toBeDefined();
    expect(screen.getByText(/spring 2026/i)).toBeDefined();
    expect(screen.queryByRole("button", { name: /save report snapshot/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /export pdf/i })).toBeNull();
  });

  it("returns notFound for unlinked child report", async () => {
    getReportSnapshotForParentMock.mockResolvedValueOnce(null);
    const page = await loadParentReportPage();

    await expect(
      page.default({ params: { snapshotId: "snapshot-1", studentId: "unlinked-student" } }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
