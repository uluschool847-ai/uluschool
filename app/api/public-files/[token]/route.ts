import { NextResponse } from "next/server";

import { isPublishedTeacherPhoto } from "@/lib/repositories/file-access-repository";
import { createStorageService, decodeStorageToken } from "@/lib/storage";

export const runtime = "nodejs";

const PUBLIC_HEADERS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
};
const MAX_REDIRECT_LOCATION_LENGTH = 8_192;

function errorResponse(status: 400 | 404 | 503, error: string) {
  return NextResponse.json({ error }, { status, headers: PUBLIC_HEADERS });
}

function safeDownloadLocation(location: string) {
  if (typeof location !== "string" || location.length > MAX_REDIRECT_LOCATION_LENGTH) {
    return null;
  }

  try {
    const redirectUrl = new URL(location);
    if (
      redirectUrl.protocol !== "https:" ||
      !redirectUrl.hostname ||
      redirectUrl.username ||
      redirectUrl.password ||
      redirectUrl.hash
    ) {
      return null;
    }

    if ((process.env.STORAGE_DRIVER ?? "local").trim().toLowerCase() === "r2") {
      const endpoint = new URL(process.env.R2_ENDPOINT ?? "");
      const bucket = (process.env.R2_BUCKET_NAME ?? "").trim();
      const validBucket =
        bucket.length >= 3 &&
        bucket.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(bucket);
      const allowedHosts = new Set([endpoint.host, `${bucket}.${endpoint.host}`]);
      if (endpoint.protocol !== "https:" || !validBucket || !allowedHosts.has(redirectUrl.host)) {
        return null;
      }
    }

    return redirectUrl;
  } catch {
    return null;
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  let storageKey: string;
  try {
    const { token } = await params;
    storageKey = decodeStorageToken(token);
    if (!storageKey.startsWith("public/")) return errorResponse(400, "Bad request");
  } catch {
    return errorResponse(400, "Bad request");
  }

  try {
    if (!(await isPublishedTeacherPhoto(storageKey))) {
      return errorResponse(404, "Not found");
    }

    const location = await createStorageService().createDownloadURL(storageKey, 60);
    const redirectUrl = safeDownloadLocation(location);
    if (!redirectUrl) return errorResponse(503, "Service unavailable");

    const response = NextResponse.redirect(redirectUrl, 302);
    for (const [name, value] of Object.entries(PUBLIC_HEADERS)) {
      response.headers.set(name, value);
    }
    return response;
  } catch {
    return errorResponse(503, "Service unavailable");
  }
}
