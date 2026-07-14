import type { UploadInput, UploadOptions } from "@/lib/storage/StorageService";
import { sanitizeStorageFilename } from "@/lib/storage/storage-key";

export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

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

type FileLike = {
  name: string;
  size: number;
  type: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

type UploadMetadata = {
  filename: string;
  size: number;
  contentType: string;
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

function normalizeContentType(value: string) {
  const contentType = value.trim().toLowerCase();
  if (!contentType || !ALLOWED_MIME_TYPES.has(contentType)) {
    throw new Error("MIME type not allowed");
  }
  return contentType;
}

export function validateUploadMetadata(input: UploadMetadata) {
  const filename = sanitizeStorageFilename(input.filename);
  if (!Number.isSafeInteger(input.size) || input.size <= 0) {
    throw new Error("File is empty");
  }
  if (input.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error("File too large (max 5MB)");
  }
  const contentType = normalizeContentType(input.contentType);
  return { filename, contentType, size: input.size };
}

export async function normalizeUploadInput(file: UploadInput, options: UploadOptions) {
  if (isFileLike(file)) {
    const fileContentType = normalizeContentType(file.type);
    const requestedContentType = options.contentType
      ? normalizeContentType(options.contentType)
      : fileContentType;
    if (requestedContentType !== fileContentType) {
      throw new Error("MIME type does not match uploaded file");
    }

    const metadata = validateUploadMetadata({
      filename: options.filename,
      size: file.size,
      contentType: requestedContentType,
    });
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length !== metadata.size || bytes.length > MAX_UPLOAD_SIZE_BYTES) {
      throw new Error("File size does not match upload metadata");
    }
    return { ...metadata, bytes };
  }

  if (Buffer.isBuffer(file)) {
    const metadata = validateUploadMetadata({
      filename: options.filename,
      size: file.length,
      contentType: options.contentType ?? "",
    });
    return { ...metadata, bytes: file };
  }

  throw new Error("Readable upload is not implemented");
}
