type TurnstileResult = {
  ok: boolean;
  reason?: "NOT_CONFIGURED" | "TOKEN_MISSING" | "VERIFICATION_FAILED";
};

export async function verifyTurnstileToken(
  token: FormDataEntryValue | null,
  remoteIp?: string,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const enforce = process.env.TURNSTILE_ENFORCE === "true";

  if (!secret) {
    return enforce ? { ok: false, reason: "NOT_CONFIGURED" } : { ok: true };
  }

  if (!token || typeof token !== "string" || token.trim().length === 0) {
    return { ok: false, reason: "TOKEN_MISSING" };
  }

  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token);
    if (remoteIp) {
      body.set("remoteip", remoteIp);
    }

    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });

    if (!response.ok) {
      return { ok: false, reason: "VERIFICATION_FAILED" };
    }

    const data = (await response.json()) as { success?: boolean };
    return data.success ? { ok: true } : { ok: false, reason: "VERIFICATION_FAILED" };
  } catch {
    return { ok: false, reason: "VERIFICATION_FAILED" };
  }
}
