import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH = join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260715120000_normalize_nairobi_timezone_data",
  "migration.sql",
);

describe("Nairobi timezone data migration", () => {
  it("normalizes only legacy Kyiv timezone values for lessons and availability rules", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8").replace(/\r\n/g, "\n");

    expect(sql).toBe(
      [
        'UPDATE "ScheduledClass"',
        "SET \"timezone\" = 'Africa/Nairobi'",
        "WHERE \"timezone\" IN ('Europe/Kiev', 'Europe/Kyiv');",
        "",
        'UPDATE "TeacherAvailabilityRule"',
        "SET \"timezone\" = 'Africa/Nairobi'",
        "WHERE \"timezone\" IN ('Europe/Kiev', 'Europe/Kyiv');",
        "",
      ].join("\n"),
    );
  });
});
