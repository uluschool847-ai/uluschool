import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("prisma/schema.prisma", "utf8");

describe("Gradebook Prisma schema contract", () => {
  it("defines AcademicTerm for term-scoped gradebook calculations", () => {
    expect(schema).toContain("model AcademicTerm");
    expect(schema).toMatch(/model AcademicTerm[\s\S]*id\s+String\s+@id/);
    expect(schema).toMatch(/model AcademicTerm[\s\S]*name\s+String/);
    expect(schema).toMatch(/model AcademicTerm[\s\S]*startDate\s+DateTime/);
    expect(schema).toMatch(/model AcademicTerm[\s\S]*endDate\s+DateTime/);
    expect(schema).toMatch(/model AcademicTerm[\s\S]*isActive\s+Boolean/);
    expect(schema).toMatch(/model AcademicTerm[\s\S]*createdAt\s+DateTime\s+@default\(now\(\)\)/);
    expect(schema).toMatch(/model AcademicTerm[\s\S]*updatedAt\s+DateTime\s+@updatedAt/);
  });

  it("defines ManualGradeEntry as a soft-archived teacher-owned grade source", () => {
    expect(schema).toContain("model ManualGradeEntry");
    expect(schema).toMatch(/model ManualGradeEntry[\s\S]*teacherId\s+String/);
    expect(schema).toMatch(/model ManualGradeEntry[\s\S]*studentId\s+String/);
    expect(schema).toMatch(/model ManualGradeEntry[\s\S]*subjectId\s+String/);
    expect(schema).toMatch(/model ManualGradeEntry[\s\S]*classGroupId\s+String\?/);
    expect(schema).toMatch(/model ManualGradeEntry[\s\S]*academicTermId\s+String/);
    expect(schema).toMatch(/model ManualGradeEntry[\s\S]*title\s+String/);
    expect(schema).toMatch(/model ManualGradeEntry[\s\S]*description\s+String\?/);
    expect(schema).toMatch(/model ManualGradeEntry[\s\S]*score\s+Float/);
    expect(schema).toMatch(/model ManualGradeEntry[\s\S]*gradedAt\s+DateTime/);
    expect(schema).toMatch(/model ManualGradeEntry[\s\S]*archivedAt\s+DateTime\?/);
    expect(schema).toMatch(
      /model ManualGradeEntry[\s\S]*createdAt\s+DateTime\s+@default\(now\(\)\)/,
    );
    expect(schema).toMatch(/model ManualGradeEntry[\s\S]*updatedAt\s+DateTime\s+@updatedAt/);
  });

  it("keeps gradebook categories explicit for HOMEWORK and MANUAL sources", () => {
    expect(schema).toMatch(/enum\s+GradebookCategory[\s\S]*HOMEWORK[\s\S]*MANUAL/);
  });
});
