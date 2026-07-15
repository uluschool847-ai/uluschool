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
    const sql = readFileSync(MIGRATION_PATH, "utf8");

    for (const table of ["ScheduledClass", "TeacherAvailabilityRule"]) {
      expect(sql).toMatch(
        new RegExp(
          `UPDATE\\s+"${table}"[\\s\\S]*?SET\\s+"timezone"\\s*=\\s*'Africa/Nairobi'[\\s\\S]*?WHERE\\s+"timezone"\\s+IN\\s*\\(\\s*'Europe/Kiev'\\s*,\\s*'Europe/Kyiv'\\s*\\)`,
          "i",
        ),
      );
    }
  });
});
