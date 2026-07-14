import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { isPasswordHash } from "@/lib/auth/backup-code-hash";

export { getBackupCodeHashFingerprint, isPasswordHash } from "@/lib/auth/backup-code-hash";

const scrypt = promisify(scryptCallback);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, hash: string) {
  if (!isPasswordHash(hash)) {
    return false;
  }

  const [salt, key] = hash.split(":");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const keyBuffer = Buffer.from(key, "hex");

  if (keyBuffer.length !== derived.length) {
    return false;
  }

  return timingSafeEqual(keyBuffer, derived);
}
