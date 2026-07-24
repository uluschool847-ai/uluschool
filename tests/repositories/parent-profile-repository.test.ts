import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  appUser: {
    findFirst: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

type ParentProfileRepositoryModule = {
  getParentProfile: (parentId: string) => Promise<unknown>;
};

function loadRepository() {
  const specifier = "@/lib/repositories/parent-profile-repository";
  return import(/* @vite-ignore */ specifier) as Promise<ParentProfileRepositoryModule>;
}

function parentRecord(overrides: Record<string, unknown> = {}) {
  return {
    children: [
      {
        email: "sofia@example.com",
        enrolledClassGroups: [
          {
            id: "group-1",
            name: "IGCSE Mathematics A",
            status: "ACTIVE",
            subject: { id: "subject-math", name: "Mathematics" },
          },
        ],
        fullName: "Sofia Shevchenko",
        id: "student-1",
      },
    ],
    createdAt: new Date("2026-01-02T10:00:00.000Z"),
    email: "parent@example.com",
    fullName: "Olena Shevchenko",
    id: "parent-1",
    isActive: true,
    role: UserRole.PARENT,
    updatedAt: new Date("2026-05-20T10:00:00.000Z"),
    ...overrides,
  };
}

describe("parent profile repository contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.appUser.findFirst.mockResolvedValue(parentRecord());
  });

  it("exports the dedicated parent profile read API", async () => {
    const repository = await loadRepository();

    expect(repository).toEqual(
      expect.objectContaining({
        getParentProfile: expect.any(Function),
      }),
    );
  });

  it("loads only an active parent profile by the server session parent id", async () => {
    const { getParentProfile } = await loadRepository();
    const profile = await getParentProfile("parent-1");

    expect(prismaMock.appUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "parent-1",
          role: UserRole.PARENT,
        }),
      }),
    );
    expect(JSON.stringify(prismaMock.appUser.findFirst.mock.calls)).not.toContain("spoofed-parent");
    expect(profile).toEqual(
      expect.objectContaining({
        children: [
          expect.objectContaining({
            classGroups: [
              expect.objectContaining({
                id: "group-1",
                name: "IGCSE Mathematics A",
                subject: expect.objectContaining({ name: "Mathematics" }),
              }),
            ],
            email: "sofia@example.com",
            id: "student-1",
            name: "Sofia Shevchenko",
          }),
        ],
        createdAt: new Date("2026-01-02T10:00:00.000Z"),
        email: "parent@example.com",
        id: "parent-1",
        isActive: true,
        name: "Olena Shevchenko",
        role: UserRole.PARENT,
        status: "Active",
        updatedAt: new Date("2026-05-20T10:00:00.000Z"),
      }),
    );
  });

  it("returns null for a missing or non-parent user", async () => {
    prismaMock.appUser.findFirst.mockResolvedValueOnce(null);
    const { getParentProfile } = await loadRepository();

    await expect(getParentProfile("teacher-1")).resolves.toBeNull();
  });

  it("does not leak unlinked children or security/session secrets", async () => {
    prismaMock.appUser.findFirst.mockResolvedValueOnce(
      parentRecord({
        children: [
          {
            email: "linked@example.com",
            enrolledClassGroups: [],
            fullName: "Linked Child",
            id: "linked-child",
          },
        ],
        passwordHash: "hashed-password",
        sessionToken: "secret-session-token",
      }),
    );

    const { getParentProfile } = await loadRepository();
    const profile = await getParentProfile("parent-1");
    const serialized = JSON.stringify(profile);

    expect(serialized).toContain("Linked Child");
    expect(serialized).not.toContain("Unlinked Child");
    expect(serialized).not.toContain("hashed-password");
    expect(serialized).not.toContain("secret-session-token");
    expect(serialized).not.toContain("passwordHash");
  });

  it("does not select authentication secret fields from the parent record", async () => {
    const { getParentProfile } = await loadRepository();
    await getParentProfile("parent-1");

    expect(prismaMock.appUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({
          passwordHash: expect.anything(),
          sessionToken: expect.anything(),
        }),
      }),
    );
  });

  it("returns an empty linked-children overview for parents without linked children", async () => {
    prismaMock.appUser.findFirst.mockResolvedValueOnce(parentRecord({ children: [] }));
    const { getParentProfile } = await loadRepository();

    await expect(getParentProfile("parent-empty")).resolves.toEqual(
      expect.objectContaining({
        children: [],
        id: "parent-1",
      }),
    );
  });
});
