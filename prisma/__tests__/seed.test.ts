import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const prisma = new PrismaClient();
const runSeedDbIntegration = process.env.RUN_SEED_DB_INTEGRATION === "1";
const suite = describe.skipIf(!runSeedDbIntegration);

suite("Seed data - Teacher records", () => {
  beforeAll(async () => {
    // This suite intentionally queries a disposable, deterministically seeded database.
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates at least 2 active Teacher records for the public /teachers page", async () => {
    const teachers = await prisma.teacher.findMany({
      where: { isActive: true },
      include: {
        teacherSubjects: {
          include: {
            subject: {
              select: {
                id: true,
                slug: true,
                name: true,
              },
            },
          },
        },
      },
    });

    expect(teachers.length).toBeGreaterThanOrEqual(2);
  });

  it("seeds the public teacher profiles expected by marketing pages", async () => {
    const teachers = await prisma.teacher.findMany({
      where: { isActive: true },
      orderBy: [{ fullName: "asc" }],
      include: {
        teacherSubjects: {
          include: {
            subject: {
              select: {
                id: true,
                slug: true,
                name: true,
              },
            },
          },
        },
      },
    });

    const names = teachers.map((teacher) => teacher.fullName);

    expect(names).toEqual(expect.arrayContaining(["Alice Brown", "Jane Doe", "John Smith"]));

    for (const teacher of teachers) {
      expect(teacher.fullName).toBeTruthy();
      expect(teacher.fullName.length).toBeGreaterThan(2);
      expect(teacher.title).toBeTruthy();
      expect(teacher.bio).toBeTruthy();
      expect(teacher.teacherSubjects.length).toBeGreaterThan(0);
    }

    const linkedTeacher = teachers.find(
      (teacher) => (teacher as { cabinetUserId?: string | null }).cabinetUserId,
    );
    expect(linkedTeacher).toBeDefined();
  });
});
