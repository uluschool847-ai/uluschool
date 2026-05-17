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

describe("ScheduledClass lesson/session Prisma schema contract", () => {
  it("defines the LessonStatus lifecycle enum for concrete lesson sessions", () => {
    const enumBlock = getPrismaBlock(readSchema(), "enum", "LessonStatus");

    expect(enumBlock, "Expected enum LessonStatus to exist").not.toBe("");
    expect(enumBlock).toMatch(/\bSCHEDULED\b/);
    expect(enumBlock).toMatch(/\bLIVE\b/);
    expect(enumBlock).toMatch(/\bCOMPLETED\b/);
    expect(enumBlock).toMatch(/\bCANCELLED\b/);
    expect(enumBlock).toMatch(/\bRESCHEDULED\b/);
  });

  it("keeps ScheduledClass as the physical model while treating it as a lesson/session", () => {
    const modelBlock = getPrismaBlock(readSchema(), "model", "ScheduledClass");

    expect(modelBlock, "Expected model ScheduledClass to exist").not.toBe("");

    const lessonFields: Array<[string, RegExp]> = [
      ["classGroupId", /\bclassGroupId\s+String\??\b/],
      ["title", /\btitle\s+String\b/],
      ["description", /\bdescription\s+String\??\b/],
      ["startAt", /\bstartAt\s+DateTime\b/],
      ["endAt", /\bendAt\s+DateTime\b/],
      ["timezone", /\btimezone\s+String\b/],
      ["status", /\bstatus\s+LessonStatus\s+@default\(SCHEDULED\)/],
      ["liveLessonUrl", /\bliveLessonUrl\s+String\??\b/],
      ["meetingProvider", /\bmeetingProvider\s+MeetingProvider\s+@default\(GOOGLE_MEET\)/],
      ["googleCalendarEventId", /\bgoogleCalendarEventId\s+String\??\b/],
      ["googleMeetSpaceName", /\bgoogleMeetSpaceName\s+String\??\b/],
      ["teacherId", /\bteacherId\s+String\??\b/],
      ["reminderMinutesBefore", /\breminderMinutesBefore\s+Int\b/],
      ["cancelledAt", /\bcancelledAt\s+DateTime\??\b/],
      ["cancelReason", /\bcancelReason\s+String\??\b/],
      ["rescheduledFromId", /\brescheduledFromId\s+String\??\b/],
      ["createdAt", /\bcreatedAt\s+DateTime\s+@default\(now\(\)\)/],
      ["updatedAt", /\bupdatedAt\s+DateTime\s+@updatedAt\b/],
    ];

    for (const [field, pattern] of lessonFields) {
      expect(modelBlock, `ScheduledClass should define ${field}`).toMatch(pattern);
    }
  });

  it("keeps cancellation and reschedule metadata nullable for ordinary scheduled lessons", () => {
    const modelBlock = getPrismaBlock(readSchema(), "model", "ScheduledClass");

    expect(modelBlock).toMatch(/\bcancelledAt\s+DateTime\?/);
    expect(modelBlock).toMatch(/\bcancelReason\s+String\?/);
    expect(modelBlock).toMatch(/\brescheduledFromId\s+String\?/);
  });

  it("does not introduce a direct teacher-student relation while lessons remain linked through groups and enrolments", () => {
    const schema = readSchema();
    const scheduledClassBlock = getPrismaBlock(schema, "model", "ScheduledClass");
    const appUserBlock = getPrismaBlock(schema, "model", "AppUser");

    expect(schema).not.toMatch(/\bmodel\s+TeacherStudent\b/);
    expect(schema).not.toMatch(/\bmodel\s+StudentTeacher\b/);
    expect(appUserBlock).not.toMatch(/\bteacherStudents\b|\bstudentTeachers\b/);
    expect(scheduledClassBlock).toMatch(/\bclassGroup\s+ClassGroup\?/);
  });
});
