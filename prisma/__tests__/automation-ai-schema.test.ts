import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("prisma/schema.prisma", "utf8");

describe("Automation and AI draft schema contract", () => {
  it("adds local task priority without changing task ownership semantics", () => {
    expect(schema).toMatch(/enum\s+TaskPriority\s+{[\s\S]*LOW[\s\S]*MEDIUM[\s\S]*HIGH[\s\S]*}/);
    expect(schema).toMatch(
      /model\s+ManagerTask\s+{[\s\S]*priority\s+TaskPriority\s+@default\(MEDIUM\)/,
    );
    expect(schema).toMatch(/@@index\(\[priority,\s*status\]\)/);
  });

  it("stores AI outputs as reviewable drafts rather than publishing them directly", () => {
    expect(schema).toMatch(
      /enum\s+AiDraftStatus\s+{[\s\S]*DRAFT[\s\S]*APPROVED[\s\S]*REJECTED[\s\S]*}/,
    );
    expect(schema).toMatch(/enum\s+AiDraftType\s+{[\s\S]*REPORT_COMMENT[\s\S]*CRM_FOLLOW_UP/);
    expect(schema).toMatch(/model\s+AiDraft\s+{/);
    expect(schema).toMatch(/inputSnapshot\s+Json/);
    expect(schema).toMatch(/outputText\s+String/);
    expect(schema).toMatch(/status\s+AiDraftStatus\s+@default\(DRAFT\)/);
    expect(schema).toMatch(/reviewedById\s+String\?/);
    expect(schema).toMatch(/relatedReportSnapshotId\s+String\?/);
    expect(schema).toMatch(/relatedEnquiryId\s+String\?/);
  });
});
