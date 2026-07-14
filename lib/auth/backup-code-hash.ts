const PASSWORD_HASH_PATTERN = /^[a-f0-9]{32}:[a-f0-9]{128}$/;

export function isPasswordHash(value: unknown): value is string {
  return typeof value === "string" && PASSWORD_HASH_PATTERN.test(value);
}

export async function getBackupCodeHashFingerprint(value: unknown): Promise<string> {
  if (
    !Array.isArray(value) ||
    value.length !== 8 ||
    !value.every((hash) => isPasswordHash(hash)) ||
    new Set(value).size !== value.length
  ) {
    throw new Error("Invalid backup code hashes");
  }

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
