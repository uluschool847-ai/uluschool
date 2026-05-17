import { NextResponse } from "next/server";

import { createStorageService } from "@/lib/storage";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "text/plain",
]);

function isAllowedRole(role: string | null) {
  if (!role) return false;
  const normalized = role.toUpperCase();
  return normalized === "DEVELOPER" || normalized === "TEACHER";
}

function isAllowedMime(type: string) {
  if (type.startsWith("image/")) return true;
  return ALLOWED_MIME_TYPES.has(type);
}

type FileLike = {
  name: string;
  size: number;
  type: string;
};

function isFileLike(value: unknown): value is FileLike & File {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FileLike>;
  return (
    typeof candidate.name === "string" &&
    typeof candidate.size === "number" &&
    typeof candidate.type === "string"
  );
}

function getStatusForUploadError(message: string) {
  if (/mime|type|allowed/i.test(message)) return 415;
  if (/5mb|too large|size/i.test(message)) return 413;
  if (/empty|zero/i.test(message)) return 400;
  if (/enospc|no space left/i.test(message)) return 507;
  return 500;
}

export async function POST(request: Request) {
  const role = request.headers.get("x-role");
  if (!isAllowedRole(role)) {
    return NextResponse.json(
      { success: false, error: "Forbidden by upload policy" },
      { status: 403 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: "Malformed multipart payload" },
      { status: 400 },
    );
  }

  const files = formData.getAll("files").filter((entry): entry is File => isFileLike(entry));
  const file = formData.get("file");
  const single = isFileLike(file) ? [file] : [];
  const effectiveFiles = files.length > 0 ? files : single;

  if (effectiveFiles.length === 0) {
    return NextResponse.json({ success: false, error: "File is required" }, { status: 400 });
  }

  const service = createStorageService({ runtimeRole: role ?? undefined });

  if (effectiveFiles.length === 1) {
    const current = effectiveFiles[0];
    const bytes = Buffer.from(await current.arrayBuffer());
    const fileSize = bytes.byteLength;
    if (fileSize <= 0) {
      return NextResponse.json({ success: false, error: "File is empty" }, { status: 400 });
    }
    if (fileSize > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: "File too large (max 5MB)" },
        { status: 413 },
      );
    }
    if (!isAllowedMime(current.type)) {
      return NextResponse.json({ success: false, error: "MIME type not allowed" }, { status: 415 });
    }

    try {
      const fileId = await service.upload(current);
      const url = service.getURL(fileId);
      return NextResponse.json({ success: true, fileId, url }, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      const status = getStatusForUploadError(message);
      const responseError = status === 500 ? "Upload failed" : message;
      return NextResponse.json({ success: false, error: responseError }, { status });
    }
  }

  const uploaded: Array<{ fileId: string; url: string; name: string }> = [];
  const failed: Array<{ name: string; error: string }> = [];

  for (const current of effectiveFiles) {
    const bytes = Buffer.from(await current.arrayBuffer());
    const fileSize = bytes.byteLength;

    if (fileSize <= 0) {
      failed.push({ name: current.name, error: "File is empty" });
      continue;
    }
    if (fileSize > MAX_FILE_SIZE_BYTES) {
      failed.push({ name: current.name, error: "File too large (max 5MB)" });
      continue;
    }
    if (!isAllowedMime(current.type)) {
      failed.push({ name: current.name, error: "MIME type not allowed" });
      continue;
    }

    try {
      const fileId = await service.upload(current);
      uploaded.push({
        fileId,
        url: service.getURL(fileId),
        name: current.name,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      failed.push({ name: current.name, error: message });
    }
  }

  if (failed.length > 0) {
    return NextResponse.json(
      {
        success: false,
        uploaded,
        failed,
      },
      { status: 207 },
    );
  }

  return NextResponse.json({ success: true, uploaded }, { status: 201 });
}
