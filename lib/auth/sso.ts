import { createHmac, timingSafeEqual } from "node:crypto";

function getSsoSecret() {
  return process.env.ADMIN_SSO_SHARED_SECRET || "";
}

function makeSignature(email: string, timestamp: string) {
  return createHmac("sha256", getSsoSecret())
    .update(`${email}:${timestamp}`)
    .digest("hex");
}

export function verifySsoSignature(input: { email: string; timestamp: string; signature: string }) {
  const secret = getSsoSecret();
  if (!secret) {
    return false;
  }

  const expected = Buffer.from(makeSignature(input.email, input.timestamp), "hex");
  const provided = Buffer.from(input.signature, "hex");
  if (expected.length !== provided.length) {
    return false;
  }
  return timingSafeEqual(expected, provided);
}

export function isSsoEnabled() {
  return process.env.ADMIN_SSO_ENABLED === "true";
}
