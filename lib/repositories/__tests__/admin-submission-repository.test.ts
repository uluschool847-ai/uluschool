import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  enquiry: {
    findMany: vi.fn(),
  },
  contactLead: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

type AdminSubmissionRepositoryModule = {
  getSubmissions: (input: {
    entityType: "enquiry" | "lead";
    search?: string;
    page?: number;
    limit?: number;
    status?: "NEW" | "IN_PROGRESS" | "CONVERTED" | "REJECTED" | null;
  }) => Promise<Array<Record<string, unknown>>>;
};

async function loadAdminSubmissionRepository() {
  const specifier = "@/lib/repositories/admin-submission-repository";
  return import(/* @vite-ignore */ specifier) as Promise<AdminSubmissionRepositoryModule>;
}

describe("admin-submission-repository reference search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a single enquiry by exact referenceId match, case-insensitive", async () => {
    prismaMock.enquiry.findMany.mockResolvedValueOnce([
      {
        id: "enq-42",
        referenceId: "MS-2026-0042",
        studentName: "Alice Student",
      },
    ]);

    const { getSubmissions } = await loadAdminSubmissionRepository();
    const result = await getSubmissions({
      entityType: "enquiry",
      search: "ms-2026-0042",
    });

    expect(prismaMock.enquiry.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { referenceId: { contains: "ms-2026-0042", mode: "insensitive" } },
          { studentName: { contains: "ms-2026-0042", mode: "insensitive" } },
          { parentGuardianName: { contains: "ms-2026-0042", mode: "insensitive" } },
          { email: { contains: "ms-2026-0042", mode: "insensitive" } },
          { phoneWhatsapp: { contains: "ms-2026-0042", mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.referenceId).toBe("MS-2026-0042");
  });

  it("supports partial referenceId matches for enquiries", async () => {
    prismaMock.enquiry.findMany.mockResolvedValueOnce([
      {
        id: "enq-42",
        referenceId: "MS-2026-0042",
        studentName: "Alice Student",
      },
    ]);

    const { getSubmissions } = await loadAdminSubmissionRepository();
    const result = await getSubmissions({
      entityType: "enquiry",
      search: "0042",
    });

    expect(prismaMock.enquiry.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { referenceId: { contains: "0042", mode: "insensitive" } },
          { studentName: { contains: "0042", mode: "insensitive" } },
          { parentGuardianName: { contains: "0042", mode: "insensitive" } },
          { email: { contains: "0042", mode: "insensitive" } },
          { phoneWhatsapp: { contains: "0042", mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    expect(result.map((item) => item.referenceId)).toEqual(["MS-2026-0042"]);
  });

  it("returns a single contact lead by referenceId match", async () => {
    prismaMock.contactLead.findMany.mockResolvedValueOnce([
      {
        id: "lead-42",
        referenceId: "MS-2026-0042",
        fullName: "Daniel Guardian",
      },
    ]);

    const { getSubmissions } = await loadAdminSubmissionRepository();
    const result = await getSubmissions({
      entityType: "lead",
      search: "MS-2026-0042",
    });

    expect(prismaMock.contactLead.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { referenceId: { contains: "MS-2026-0042", mode: "insensitive" } },
          { fullName: { contains: "MS-2026-0042", mode: "insensitive" } },
          { email: { contains: "MS-2026-0042", mode: "insensitive" } },
          { phoneWhatsapp: { contains: "MS-2026-0042", mode: "insensitive" } },
          { studentGrade: { contains: "MS-2026-0042", mode: "insensitive" } },
          { message: { contains: "MS-2026-0042", mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.referenceId).toBe("MS-2026-0042");
  });

  it("applies CRM status filters with search", async () => {
    prismaMock.contactLead.findMany.mockResolvedValueOnce([]);

    const { getSubmissions } = await loadAdminSubmissionRepository();
    await getSubmissions({
      entityType: "lead",
      search: "guardian",
      status: "IN_PROGRESS",
    });

    expect(prismaMock.contactLead.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { referenceId: { contains: "guardian", mode: "insensitive" } },
          { fullName: { contains: "guardian", mode: "insensitive" } },
          { email: { contains: "guardian", mode: "insensitive" } },
          { phoneWhatsapp: { contains: "guardian", mode: "insensitive" } },
          { studentGrade: { contains: "guardian", mode: "insensitive" } },
          { message: { contains: "guardian", mode: "insensitive" } },
        ],
        status: "IN_PROGRESS",
      },
      orderBy: { createdAt: "desc" },
    });
  });

  it("applies explicit pagination without changing search and status filters", async () => {
    prismaMock.enquiry.findMany.mockResolvedValueOnce([]);

    const { getSubmissions } = await loadAdminSubmissionRepository();
    await getSubmissions({
      entityType: "enquiry",
      search: "alice",
      status: "NEW",
      page: 3,
      limit: 20,
    });

    expect(prismaMock.enquiry.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { referenceId: { contains: "alice", mode: "insensitive" } },
          { studentName: { contains: "alice", mode: "insensitive" } },
          { parentGuardianName: { contains: "alice", mode: "insensitive" } },
          { email: { contains: "alice", mode: "insensitive" } },
          { phoneWhatsapp: { contains: "alice", mode: "insensitive" } },
        ],
        status: "NEW",
      },
      orderBy: { createdAt: "desc" },
      skip: 40,
      take: 20,
    });
  });
});
