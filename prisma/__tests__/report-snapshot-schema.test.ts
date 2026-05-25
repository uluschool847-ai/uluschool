import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("prisma/schema.prisma", "utf8");

describe("ReportSnapshot Prisma schema contract", () => {
  it("defines an immutable saved report snapshot model with scoped relations", () => {
    expect(schema).toMatch(/model\s+ReportSnapshot\s+{/);
    expect(schema).toMatch(/studentId\s+String/);
    expect(schema).toMatch(/classGroupId\s+String/);
    expect(schema).toMatch(/academicTermId\s+String/);
    expect(schema).toMatch(/generatedByTeacherId\s+String/);
    expect(schema).toMatch(/generatedAt\s+DateTime/);
    expect(schema).toMatch(/snapshotVersion\s+(Int|String)/);
    expect(schema).toMatch(/teacherComment\s+String\?/);
    expect(schema).toMatch(/snapshotData\s+Json/);
    expect(schema).toMatch(/pdfStorageKey\s+String\?/);
    expect(schema).toMatch(/pdfGeneratedAt\s+DateTime\?/);
    expect(schema).toMatch(/createdAt\s+DateTime\s+@default\(now\(\)\)/);
    expect(schema).toMatch(/updatedAt\s+DateTime\s+@updatedAt/);
  });

  it("keeps reports as saved snapshots rather than live-only derived rows", () => {
    expect(schema).toMatch(/snapshotData\s+Json/);
    expect(schema).not.toMatch(/model\s+ReportNarrative\s+{/);
    expect(schema).not.toMatch(/aiGeneratedComment|emailSentAt|bulkReportJobId/);
  });
});
