import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCHEMA_PATH = join(ROOT, "prisma", "schema.prisma");
const MIGRATIONS_DIR = join(ROOT, "prisma", "migrations");

function readSchema() {
  return readFileSync(SCHEMA_PATH, "utf8");
}

function getPrismaBlock(schema: string, kind: "enum" | "model", name: string) {
  return new RegExp(`${kind}\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`, "m").exec(schema)?.[1] ?? "";
}

function walkSqlFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      return walkSqlFiles(fullPath);
    }
    return entry === "migration.sql" ? [fullPath] : [];
  });
}

function readAllMigrationSql() {
  return walkSqlFiles(MIGRATIONS_DIR)
    .map((filePath) => readFileSync(filePath, "utf8"))
    .join("\n\n");
}

describe("ClassGroup Prisma schema contract", () => {
  it("defines the ClassGroupStatus lifecycle enum", () => {
    const enumBlock = getPrismaBlock(readSchema(), "enum", "ClassGroupStatus");

    expect(enumBlock, "Expected enum ClassGroupStatus to exist").not.toBe("");
    expect(enumBlock).toMatch(/\bACTIVE\b/);
    expect(enumBlock).toMatch(/\bPAUSED\b/);
    expect(enumBlock).toMatch(/\bARCHIVED\b/);
  });

  it("defines ClassGroup as the learning group aggregate", () => {
    const modelBlock = getPrismaBlock(readSchema(), "model", "ClassGroup");

    expect(modelBlock, "Expected model ClassGroup to exist").not.toBe("");

    const scalarFields: Array<[string, RegExp]> = [
      ["id", /\bid\s+String\s+@id\b/],
      ["name", /\bname\s+String\b/],
      ["description", /\bdescription\s+String\??\b/],
      ["subjectId", /\bsubjectId\s+String\??\b/],
      ["levelId", /\blevelId\s+String\??\b/],
      ["teacherId", /\bteacherId\s+String\??\b/],
      ["status", /\bstatus\s+ClassGroupStatus\b/],
      ["capacity", /\bcapacity\s+Int\??\b/],
      ["startDate", /\bstartDate\s+DateTime\??\b/],
      ["endDate", /\bendDate\s+DateTime\??\b/],
      ["createdAt", /\bcreatedAt\s+DateTime\s+@default\(now\(\)\)/],
      ["updatedAt", /\bupdatedAt\s+DateTime\s+@updatedAt\b/],
    ];

    for (const [field, pattern] of scalarFields) {
      expect(modelBlock, `ClassGroup should define ${field}`).toMatch(pattern);
    }

    const relationFields: Array<[string, RegExp]> = [
      [
        "subject",
        /\bsubject\s+Subject\??\s+@relation\([^)]*fields:\s*\[subjectId\][^)]*references:\s*\[id\]/s,
      ],
      [
        "level",
        /\blevel\s+Level\??\s+@relation\([^)]*fields:\s*\[levelId\][^)]*references:\s*\[id\]/s,
      ],
      [
        "teacher",
        /\bteacher\s+AppUser\??\s+@relation\([^)]*fields:\s*\[teacherId\][^)]*references:\s*\[id\]/s,
      ],
      ["students", /\bstudents\s+AppUser\[\]/],
      ["lessons", /\blessons\s+ScheduledClass\[\]/],
    ];

    for (const [field, pattern] of relationFields) {
      expect(modelBlock, `ClassGroup should define ${field} relation`).toMatch(pattern);
    }
  });

  it("keeps ScheduledClass as the concrete lesson/session and links it to a group", () => {
    const scheduledClassBlock = getPrismaBlock(readSchema(), "model", "ScheduledClass");

    expect(scheduledClassBlock).toMatch(/\bclassGroupId\s+String\?(?!\w)/);
    expect(scheduledClassBlock).toMatch(
      /\bclassGroup\s+ClassGroup\?\s+@relation\([^)]*fields:\s*\[classGroupId\][^)]*references:\s*\[id\]/s,
    );
  });
});

describe("ClassGroup migration and backfill contract", () => {
  it("documents the gradual migration from ScheduledClass rows to generated ClassGroups", () => {
    const migrationSql = readAllMigrationSql();

    expect(migrationSql, "Migration should create the ClassGroupStatus enum").toMatch(
      /CREATE\s+TYPE\s+"ClassGroupStatus"|CREATE\s+TYPE\s+ClassGroupStatus/i,
    );
    expect(migrationSql, "Migration should create the ClassGroup table").toMatch(
      /CREATE\s+TABLE\s+"ClassGroup"/i,
    );
    expect(migrationSql, "Migration should add nullable ScheduledClass.classGroupId").toMatch(
      /ALTER\s+TABLE\s+"ScheduledClass"\s+ADD\s+COLUMN\s+"classGroupId"\s+TEXT/i,
    );
    expect(migrationSql, "Backfill should create one ClassGroup from each ScheduledClass").toMatch(
      /INSERT\s+INTO\s+"ClassGroup"[\s\S]*SELECT[\s\S]*FROM\s+"ScheduledClass"/i,
    );
    expect(migrationSql, "Backfill should copy ScheduledClass.title into ClassGroup.name").toMatch(
      /INSERT\s+INTO\s+"ClassGroup"[\s\S]*"name"[\s\S]*SELECT[\s\S]*"title"/i,
    );
    expect(migrationSql, "Backfill should copy ScheduledClass.teacherId into ClassGroup").toMatch(
      /INSERT\s+INTO\s+"ClassGroup"[\s\S]*"teacherId"[\s\S]*SELECT[\s\S]*"teacherId"/i,
    );
    expect(
      migrationSql,
      "Backfill should point each ScheduledClass at its generated ClassGroup",
    ).toMatch(/UPDATE\s+"ScheduledClass"[\s\S]*SET\s+"classGroupId"/i);
    expect(
      migrationSql,
      "Backfill should copy lesson students from the old ScheduledClass enrollment join table to group students",
    ).toMatch(
      /INSERT\s+INTO\s+"_[^"]*(ClassGroup|Group)[^"]*(Enrollment|Student)[^"]*"[\s\S]*FROM\s+"_[^"]*ClassEnrollments[^"]*"/i,
    );
  });
});
