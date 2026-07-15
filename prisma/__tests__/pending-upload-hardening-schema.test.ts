import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const schema = readFileSync(join(root, "prisma", "schema.prisma"), "utf8");
const followUpMigrationPath = join(
  root,
  "prisma",
  "migrations",
  "20260716120000_pending_upload_claims_active_storage",
  "migration.sql",
);

describe("pending upload hardening schema", () => {
  it("adds a persisted cleanup lease without rewriting the applied reservation migration", () => {
    expect(schema).toMatch(/model\s+PendingUpload\s+{[\s\S]*claimToken\s+String\?/);
    expect(schema).toMatch(/model\s+PendingUpload\s+{[\s\S]*claimedAt\s+DateTime\?/);
    expect(schema).toMatch(/@@index\(\[expiresAt,\s*claimedAt\]\)/);

    const migration = readFileSync(followUpMigrationPath, "utf8");
    expect(migration).toContain('ALTER TABLE "PendingUpload"');
    expect(migration).toContain('ADD COLUMN "claimToken" TEXT');
    expect(migration).toContain('ADD COLUMN "claimedAt" TIMESTAMP(3)');
  });

  it("adds an owner-bound active object ledger with exact accounting metadata", () => {
    expect(schema).toMatch(/model\s+ActiveStorageObject\s+{/);
    expect(schema).toMatch(/storageKey\s+String\s+@unique/);
    expect(schema).toMatch(/owner\s+AppUser\s+@relation/);
    expect(schema).toMatch(/purpose\s+String/);
    expect(schema).toMatch(/filename\s+String/);
    expect(schema).toMatch(/mimeType\s+String/);
    expect(schema).toMatch(/byteSize\s+Int/);
    expect(schema).toMatch(/@@index\(\[ownerId,\s*purpose\]\)/);
  });
});
