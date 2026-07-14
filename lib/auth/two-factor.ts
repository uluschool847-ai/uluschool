import { randomBytes } from "node:crypto";

import { authenticator } from "otplib";

import { hashPassword, verifyPassword } from "@/lib/auth/password";

authenticator.options = {
  window: 1,
};

export function generateTwoFactorSecret() {
  return authenticator.generateSecret();
}

export function getTotpUri(email: string, secret: string) {
  const issuer = process.env.TWO_FACTOR_ISSUER || "ULU Online School";
  return authenticator.keyuri(email, issuer, secret);
}

export function verifyTotpCode(code: string, secret: string) {
  return authenticator.verify({ token: code, secret });
}

function randomBackupCode() {
  return randomBytes(5).toString("hex").toUpperCase();
}

export async function generateBackupCodes(generateCode: () => string = randomBackupCode) {
  const uniqueCodes = new Set<string>();

  for (let attempt = 0; uniqueCodes.size < 8 && attempt < 64; attempt += 1) {
    uniqueCodes.add(generateCode());
  }

  if (uniqueCodes.size !== 8) {
    throw new Error("Unable to generate unique backup codes.");
  }

  const plain = Array.from(uniqueCodes);
  const hashed = await Promise.all(plain.map((code) => hashPassword(code)));
  return { plain, hashed };
}

export async function consumeBackupCode(input: {
  providedCode: string;
  hashedCodes: string[];
}) {
  const normalized = input.providedCode.trim().toUpperCase();
  for (let index = 0; index < input.hashedCodes.length; index += 1) {
    const hash = input.hashedCodes[index];
    const valid = await verifyPassword(normalized, hash);
    if (!valid) continue;

    const remaining = input.hashedCodes.filter((_, i) => i !== index);
    return { valid: true as const, remaining };
  }
  return { valid: false as const, remaining: input.hashedCodes };
}
