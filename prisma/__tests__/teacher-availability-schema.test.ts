import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCHEMA_PATH = join(ROOT, "prisma", "schema.prisma");

function readSchema() {
  return readFileSync(SCHEMA_PATH, "utf8");
}

function getPrismaBlock(schema: string, kind: "enum" | "model", name: string) {
  return new RegExp(`${kind}\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`, "m").exec(schema)?.[1] ?? "";
}

describe("Teacher Availability Prisma schema contract", () => {
  it("defines AvailabilitySlotStatus for availability rule lifecycle", () => {
    const enumBlock = getPrismaBlock(readSchema(), "enum", "AvailabilitySlotStatus");

    expect(enumBlock, "Expected enum AvailabilitySlotStatus to exist").not.toBe("");
    expect(enumBlock).toMatch(/\bACTIVE\b/);
    expect(enumBlock).toMatch(/\bINACTIVE\b/);
  });

  it("defines TeacherAvailabilityRule using weekday 1-7 where 1 is Monday and 7 is Sunday", () => {
    const modelBlock = getPrismaBlock(readSchema(), "model", "TeacherAvailabilityRule");

    expect(modelBlock, "Expected model TeacherAvailabilityRule to exist").not.toBe("");

    const fields: Array<[string, RegExp]> = [
      ["id", /\bid\s+String\s+@id\b/],
      ["teacherId", /\bteacherId\s+String\b/],
      ["weekday", /\bweekday\s+Int\b/],
      ["startTime", /\bstartTime\s+String\b/],
      ["endTime", /\bendTime\s+String\b/],
      ["timezone", /\btimezone\s+String\b/],
      ["status", /\bstatus\s+AvailabilitySlotStatus\b/],
      ["createdAt", /\bcreatedAt\s+DateTime\s+@default\(now\(\)\)/],
      ["updatedAt", /\bupdatedAt\s+DateTime\s+@updatedAt\b/],
    ];

    for (const [field, pattern] of fields) {
      expect(modelBlock, `TeacherAvailabilityRule should define ${field}`).toMatch(pattern);
    }

    expect(modelBlock).toMatch(
      /\bteacher\s+AppUser\s+@relation\([^)]*fields:\s*\[teacherId\][^)]*references:\s*\[id\][^)]*onDelete:\s*Cascade/s,
    );
    expect(modelBlock).toMatch(/@@index\(\[teacherId,\s*weekday,\s*status\]\)/);
  });

  it("defines TeacherUnavailablePeriod with teacher relation, cascade delete, and date-range index", () => {
    const modelBlock = getPrismaBlock(readSchema(), "model", "TeacherUnavailablePeriod");

    expect(modelBlock, "Expected model TeacherUnavailablePeriod to exist").not.toBe("");

    const fields: Array<[string, RegExp]> = [
      ["id", /\bid\s+String\s+@id\b/],
      ["teacherId", /\bteacherId\s+String\b/],
      ["startAt", /\bstartAt\s+DateTime\b/],
      ["endAt", /\bendAt\s+DateTime\b/],
      ["reason", /\breason\s+String\??\b/],
      ["createdAt", /\bcreatedAt\s+DateTime\s+@default\(now\(\)\)/],
      ["updatedAt", /\bupdatedAt\s+DateTime\s+@updatedAt\b/],
    ];

    for (const [field, pattern] of fields) {
      expect(modelBlock, `TeacherUnavailablePeriod should define ${field}`).toMatch(pattern);
    }

    expect(modelBlock).toMatch(
      /\bteacher\s+AppUser\s+@relation\([^)]*fields:\s*\[teacherId\][^)]*references:\s*\[id\][^)]*onDelete:\s*Cascade/s,
    );
    expect(modelBlock).toMatch(/@@index\(\[teacherId,\s*startAt,\s*endAt\]\)/);
  });

  it("adds reverse AppUser relations without adding a direct teacher-student relation", () => {
    const schema = readSchema();
    const appUserBlock = getPrismaBlock(schema, "model", "AppUser");

    expect(appUserBlock).toMatch(/\bavailabilityRules\s+TeacherAvailabilityRule\[\]/);
    expect(appUserBlock).toMatch(/\bunavailablePeriods\s+TeacherUnavailablePeriod\[\]/);
    expect(schema).not.toMatch(/\bmodel\s+TeacherStudent\b/);
    expect(schema).not.toMatch(/\bmodel\s+StudentTeacher\b/);
    expect(appUserBlock).not.toMatch(/\bteacherStudents\b|\bstudentTeachers\b/);
  });
});
