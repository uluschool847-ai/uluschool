import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("GitHub CI production-readiness contract", () => {
  it("pins Node 22 and runs every required verification command", () => {
    const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
    const nvmrc = readFileSync(join(root, ".nvmrc"), "utf8").trim();

    expect(nvmrc).toBe("22");
    expect(workflow).toContain("node-version-file: .nvmrc");
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("npx prisma migrate deploy");
    expect(workflow).toContain("npm run db:seed");
    expect(workflow).toContain("npx prisma validate");
    expect(workflow).toContain("npm run lint");
    expect(workflow).toContain("npm run typecheck");
    expect(workflow).toContain("npm run test");
    expect(workflow).toContain("npm run build");
  });

  it("provides a disposable PostgreSQL service", () => {
    const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");

    expect(workflow).toContain("image: postgres:16");
    expect(workflow).toContain("ulu_school_test");
    expect(workflow).not.toContain("onrender.com");
  });
});
