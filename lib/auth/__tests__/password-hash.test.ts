import { describe, expect, it } from "vitest";

import { hashPassword, isPasswordHash } from "@/lib/auth/password";

describe("password hash format", () => {
  it("recognizes the exact format produced by hashPassword", async () => {
    const hash = await hashPassword("BackupCode123");

    expect(isPasswordHash(hash)).toBe(true);
  });

  it.each([
    null,
    undefined,
    "",
    "plaintext-backup-code",
    `${"a".repeat(31)}:${"b".repeat(128)}`,
    `${"a".repeat(32)}:${"b".repeat(127)}`,
    `${"g".repeat(32)}:${"b".repeat(128)}`,
    `${"a".repeat(32)}:${"z".repeat(128)}`,
    `${"a".repeat(32)}:${"b".repeat(128)}:extra`,
  ])("rejects malformed hash value %#", (value) => {
    expect(isPasswordHash(value)).toBe(false);
  });
});
