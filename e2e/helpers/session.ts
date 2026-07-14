import type { UserRole } from "@prisma/client";

const SESSION_DURATION_MS = 60 * 60 * 1000;

export type E2ESessionInput = {
  uid: string;
  role: UserRole;
  email: string;
  fullName: string;
  mfaVerified?: boolean;
};

function toBase64Url(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function getSessionSecret() {
  return process.env.AUTH_SESSION_SECRET ?? "dev-only-auth-session-secret-please-change";
}

async function signPayload(payloadBase64: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadBase64));
  const signatureString = Array.from(new Uint8Array(signature), (byte) =>
    String.fromCharCode(byte),
  ).join("");
  return toBase64Url(signatureString);
}

export async function createSessionToken(input: E2ESessionInput): Promise<string> {
  const payloadBase64 = toBase64Url(
    JSON.stringify({
      purpose: "SESSION",
      uid: input.uid,
      role: input.role,
      email: input.email,
      fullName: input.fullName,
      exp: Date.now() + SESSION_DURATION_MS,
      mfaVerified: input.mfaVerified ?? true,
      authMethod: "password",
    }),
  );
  return `${payloadBase64}.${await signPayload(payloadBase64)}`;
}
