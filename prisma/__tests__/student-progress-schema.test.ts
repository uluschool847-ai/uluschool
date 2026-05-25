import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("prisma/schema.prisma", "utf8");

function studentProgressModel() {
  const match = schema.match(/model StudentProgress \{[\s\S]*?\n\}/);
  if (!match) {
    throw new Error("StudentProgress model is missing");
  }
  return match[0];
}

describe("StudentProgress schema lifecycle contract", () => {
  it("supports updatedAt and soft archive lifecycle fields", () => {
    const model = studentProgressModel();

    expect(model).toMatch(/updatedAt\s+DateTime\s+@updatedAt/);
    expect(model).toMatch(/archivedAt\s+DateTime\?/);
  });

  it("keeps progress notes soft-archivable rather than physically deleted", () => {
    const model = studentProgressModel();

    expect(model).toContain("archivedAt");
    expect(model).toMatch(/@@index\(\[teacherId,\s*studentId,\s*subjectId/);
  });
});
