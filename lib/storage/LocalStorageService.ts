import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";

import type { StorageService, UploadInput } from "@/lib/storage/StorageService";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

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

function sanitizeFilename(raw: string) {
  const base = path.basename(raw).replace(/[\\\/]+/g, "-");
  const clean = base.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  return clean || "file.bin";
}

function ensureAllowedMime(mimeType: string) {
  if (mimeType.startsWith("image/")) {
    return;
  }
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error("MIME type not allowed");
  }
}

type FileLike = {
  name: string;
  size: number;
  type: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

function isFileLike(value: unknown): value is FileLike {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FileLike>;
  return (
    typeof candidate.name === "string" &&
    typeof candidate.size === "number" &&
    typeof candidate.type === "string" &&
    typeof candidate.arrayBuffer === "function"
  );
}

function asBufferFromReadable(_readable: Readable): never {
  throw new Error("Readable upload is not implemented in local mode");
}

async function normalizeUploadInput(file: UploadInput, filename?: string) {
  if (isFileLike(file)) {
    const size = file.size;
    if (size <= 0) {
      throw new Error("File is empty");
    }
    if (size > MAX_FILE_SIZE_BYTES) {
      throw new Error("File too large (max 5MB)");
    }
    ensureAllowedMime(file.type);
    const bytes = Buffer.from(await file.arrayBuffer());
    return {
      filename: sanitizeFilename(file.name),
      mimeType: file.type,
      bytes,
    };
  }

  if (Buffer.isBuffer(file)) {
    if (!filename) {
      throw new Error("Filename is required for Buffer uploads");
    }
    if (file.length <= 0) {
      throw new Error("File is empty");
    }
    if (file.length > MAX_FILE_SIZE_BYTES) {
      throw new Error("File too large (max 5MB)");
    }
    return {
      filename: sanitizeFilename(filename),
      mimeType: "application/octet-stream",
      bytes: file,
    };
  }

  return {
    filename: sanitizeFilename(filename ?? "upload.bin"),
    mimeType: "application/octet-stream",
    bytes: asBufferFromReadable(file as Readable),
  };
}

export class LocalStorageService implements StorageService {
  constructor(private readonly uploadRoot = DEFAULT_UPLOAD_ROOT) {}

  async upload(file: UploadInput, filename?: string): Promise<string> {
    const normalized = await normalizeUploadInput(file, filename);

    await mkdir(this.uploadRoot, { recursive: true });

    const ext = path.extname(normalized.filename);
    const stem = path.basename(normalized.filename, ext);
    const unique = `${stem}-${Date.now()}-${randomUUID()}${ext || ""}`;
    const relativeKey = path.posix.join("uploads", unique);
    const absolutePath = path.join(this.uploadRoot, unique);

    await writeFile(absolutePath, normalized.bytes);

    return relativeKey;
  }

  getURL(storageKey: string): string {
    const normalized = storageKey.replace(/^\/+/, "");
    const withoutPublicPrefix = normalized.replace(/^public[\\/]/, "");
    const key = withoutPublicPrefix.startsWith("uploads/")
      ? withoutPublicPrefix
      : `uploads/${withoutPublicPrefix}`;

    return `/${key}`;
  }

  async delete(storageKey: string): Promise<void> {
    const key = storageKey
      .replace(/^\/+/, "")
      .replace(/^public[\\\/]/, "")
      .replace(/^uploads[\\\/]?/, "");
    const uploadRoot = path.resolve(this.uploadRoot);
    const absolutePath = path.resolve(uploadRoot, key);

    if (absolutePath !== uploadRoot && !absolutePath.startsWith(`${uploadRoot}${path.sep}`)) {
      return;
    }

    try {
      await unlink(absolutePath);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "ENOENT"
      ) {
        return;
      }
      throw error;
    }
  }
}
