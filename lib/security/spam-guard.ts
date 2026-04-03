import { headers } from "next/headers";

export async function getRequestIdentifier() {
  const h = await headers();
  const forwardedFor = h.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() || "unknown";
  return ip;
}

export function honeypotTriggered(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim().length > 0;
}

export function submittedTooFast(startedAtValue: FormDataEntryValue | null) {
  const minMs = Number(process.env.MIN_FORM_FILL_MS ?? "1200");
  if (!startedAtValue || typeof startedAtValue !== "string") return false;

  const startedAt = Number(startedAtValue);
  if (!Number.isFinite(startedAt) || startedAt <= 0) return false;

  return Date.now() - startedAt < minMs;
}
