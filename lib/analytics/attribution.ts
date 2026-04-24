import { cookies, headers } from "next/headers";

export type AttributionInput = {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  referrer?: string | null;
};

function normalize(value: string | undefined | null) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function getAttributionFromRequest(): Promise<AttributionInput> {
  const cookieStore = await cookies();
  const headerStore = await headers();

  return {
    utmSource: normalize(cookieStore.get("utm_source")?.value),
    utmMedium: normalize(cookieStore.get("utm_medium")?.value),
    utmCampaign: normalize(cookieStore.get("utm_campaign")?.value),
    referrer:
      normalize(cookieStore.get("referrer")?.value) ||
      normalize(headerStore.get("referer")) ||
      null,
  };
}
