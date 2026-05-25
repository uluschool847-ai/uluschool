import { NextResponse } from "next/server";

import { createStorageService } from "@/lib/storage";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
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

function sanitizeFilename(raw: string) {
  const parts = raw.split(/[\\/]+/);
  const base = parts.at(-1) ?? "file";
  const clean = base.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  return clean || "file";
}

function filenameFromStorageKey(storageKey: string) {
  return sanitizeFilename(storageKey.split(/[\\/]+/).at(-1) ?? "file");
}

function responseFilename(file: FileLike, storageKey: string) {
  const filename = sanitizeFilename(file.name);
  return filename === "blob" ? filenameFromStorageKey(storageKey) : filename;
}

type FileLike = {
  name: string;
  size: number;
  type: string;
};

type UploadedFilePayload = {
  fileId: string;
  url: string;
  name: string;
  filename?: string;
  mimeType?: string;
  publicUrl?: string;
  size?: number;
  storageKey?: string;
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

function uploadSuccessPayload(input: {
  filename: string;
  mimeType: string;
  role: string | null;
  size: number;
  storageKey: string;
  publicUrl: string;
}) {
  const legacy = {
    success: true,
    fileId: input.storageKey,
    url: input.publicUrl,
  };

  if (input.role?.toUpperCase() !== "TEACHER") {
    return legacy;
  }

  return {
    ...legacy,
    storageKey: input.storageKey,
    publicUrl: input.publicUrl,
    filename: input.filename,
    mimeType: input.mimeType,
    size: input.size,
  };
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
    const fileSize = current.size;
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
      return NextResponse.json(
        uploadSuccessPayload({
          role,
          storageKey: fileId,
          publicUrl: url,
          filename: responseFilename(current, fileId),
          mimeType: current.type,
          size: fileSize,
        }),
        { status: 201 },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      const status = getStatusForUploadError(message);
      const responseError = status === 500 ? "Upload failed" : message;
      return NextResponse.json({ success: false, error: responseError }, { status });
    }
  }

  const uploaded: UploadedFilePayload[] = [];
  const failed: Array<{ name: string; error: string }> = [];

  for (const current of effectiveFiles) {
    const fileSize = current.size;

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
      const url = service.getURL(fileId);
      uploaded.push({
        fileId,
        storageKey: fileId,
        url,
        publicUrl: url,
        filename: responseFilename(current, fileId),
        mimeType: current.type,
        size: fileSize,
        name: responseFilename(current, fileId),
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
