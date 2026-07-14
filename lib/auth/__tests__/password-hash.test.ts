import { describe, expect, it } from "vitest";

import { getBackupCodeHashFingerprint, hashPassword, isPasswordHash } from "@/lib/auth/password";

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

  it("fingerprints exactly eight unique valid hashes in their persisted order", async () => {
    const hashes = await Promise.all(
      Array.from({ length: 8 }, (_, index) => hashPassword(`BackupCode-${index}`)),
    );

    const fingerprint = await getBackupCodeHashFingerprint(hashes);

    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    await expect(getBackupCodeHashFingerprint([...hashes].reverse())).resolves.not.toBe(
      fingerprint,
    );
    await expect(getBackupCodeHashFingerprint(hashes.slice(0, 7))).rejects.toThrow(
      "Invalid backup code hashes",
    );
    await expect(
      getBackupCodeHashFingerprint([...hashes.slice(0, 7), "plaintext"]),
    ).rejects.toThrow("Invalid backup code hashes");
  });
});
