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

describe("Live lesson URL and meeting metadata Prisma schema contract", () => {
  it("defines the MeetingProvider enum for first-party Meet and manual links", () => {
    const enumBlock = getPrismaBlock(readSchema(), "enum", "MeetingProvider");

    expect(enumBlock, "Expected enum MeetingProvider to exist").not.toBe("");
    expect(enumBlock).toMatch(/\bGOOGLE_MEET\b/);
    expect(enumBlock).toMatch(/\bMANUAL_URL\b/);
  });

  it("stores live lesson URL and meeting metadata on ScheduledClass", () => {
    const modelBlock = getPrismaBlock(readSchema(), "model", "ScheduledClass");

    expect(modelBlock, "Expected model ScheduledClass to exist").not.toBe("");
    expect(modelBlock, "liveLessonUrl should be nullable until provider creates a link").toMatch(
      /\bliveLessonUrl\s+String\?/,
    );
    expect(modelBlock, "meetingProvider should use the enum and default to GOOGLE_MEET").toMatch(
      /\bmeetingProvider\s+MeetingProvider\s+@default\(GOOGLE_MEET\)/,
    );
    expect(modelBlock).toMatch(/\bgoogleCalendarEventId\s+String\?/);
    expect(modelBlock).toMatch(/\bgoogleMeetSpaceName\s+String\?/);
    expect(modelBlock).toMatch(/\bmeetingCreatedAt\s+DateTime\?/);
    expect(modelBlock).toMatch(/\bmeetingUpdatedAt\s+DateTime\?/);
  });

  it("keeps existing lesson lifecycle fields unchanged", () => {
    const schema = readSchema();
    const enumBlock = getPrismaBlock(schema, "enum", "LessonStatus");
    const modelBlock = getPrismaBlock(schema, "model", "ScheduledClass");

    expect(enumBlock).toMatch(/\bSCHEDULED\b/);
    expect(enumBlock).toMatch(/\bLIVE\b/);
    expect(enumBlock).toMatch(/\bCOMPLETED\b/);
    expect(enumBlock).toMatch(/\bCANCELLED\b/);
    expect(enumBlock).toMatch(/\bRESCHEDULED\b/);
    expect(modelBlock).toMatch(/\bstatus\s+LessonStatus\s+@default\(SCHEDULED\)/);
    expect(modelBlock).toMatch(/\bcancelledAt\s+DateTime\?/);
    expect(modelBlock).toMatch(/\bcancelReason\s+String\?/);
    expect(modelBlock).toMatch(/\bcompletedAt\s+DateTime\?/);
    expect(modelBlock).toMatch(/\brescheduledFromId\s+String\?/);
  });
});
