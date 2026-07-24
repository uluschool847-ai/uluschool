import { randomBytes } from "node:crypto";

export function generateTemporaryPassword() {
  return randomBytes(15).toString("base64url");
}
