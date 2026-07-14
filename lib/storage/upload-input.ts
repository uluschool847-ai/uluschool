import { unzipSync } from "fflate";

import type { UploadInput, UploadOptions } from "@/lib/storage/StorageService";
import { sanitizeStorageFilename } from "@/lib/storage/storage-key";

export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 256;
const MAX_ZIP_ENTRY_BYTES = 10 * 1024 * 1024;
const MAX_ZIP_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
const MAX_CONTENT_TYPES_BYTES = 1024 * 1024;

export type UploadValidationStatus = 400 | 413 | 415;

export class UploadValidationError extends Error {
  readonly name = "UploadValidationError";

  constructor(
    readonly code: string,
    readonly status: UploadValidationStatus,
    readonly publicMessage: string,
  ) {
    super(publicMessage);
  }
}

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

type ContentKind =
  | "doc"
  | "docx"
  | "gif"
  | "jpeg"
  | "pdf"
  | "png"
  | "ppt"
  | "pptx"
  | "text"
  | "webp"
  | "zip";

const TYPE_RULES: Record<string, { extensions: string[]; kind: ContentKind }> = {
  "application/pdf": { extensions: [".pdf"], kind: "pdf" },
  "application/msword": { extensions: [".doc"], kind: "doc" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    extensions: [".docx"],
    kind: "docx",
  },
  "application/vnd.ms-powerpoint": { extensions: [".ppt"], kind: "ppt" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    extensions: [".pptx"],
    kind: "pptx",
  },
  "application/zip": { extensions: [".zip"], kind: "zip" },
  "application/x-zip-compressed": { extensions: [".zip"], kind: "zip" },
  "image/png": { extensions: [".png"], kind: "png" },
  "image/jpeg": { extensions: [".jpg", ".jpeg"], kind: "jpeg" },
  "image/jpg": { extensions: [".jpg", ".jpeg"], kind: "jpeg" },
  "image/webp": { extensions: [".webp"], kind: "webp" },
  "image/gif": { extensions: [".gif"], kind: "gif" },
  "text/plain": { extensions: [".txt"], kind: "text" },
};

const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function uploadError(code: string, status: UploadValidationStatus, publicMessage: string) {
  return new UploadValidationError(code, status, publicMessage);
}

function contentMismatch(): never {
  throw uploadError("CONTENT_MISMATCH", 415, "File content does not match its type");
}

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

function safeFilename(value: string) {
  try {
    return sanitizeStorageFilename(value);
  } catch {
    throw uploadError("INVALID_FILENAME", 400, "Invalid filename");
  }
}

function normalizeContentType(value: string) {
  const contentType = value.trim().toLowerCase();
  if (!contentType || !TYPE_RULES[contentType]) {
    throw uploadError("UNSUPPORTED_TYPE", 415, "Unsupported file type");
  }
  return contentType;
}

function assertExtensionMatches(filename: string, contentType: string) {
  const lowerFilename = filename.toLowerCase();
  if (!TYPE_RULES[contentType].extensions.some((extension) => lowerFilename.endsWith(extension))) {
    contentMismatch();
  }
}

export function validateUploadMetadata(input: UploadMetadata) {
  const filename = safeFilename(input.filename);
  if (!Number.isSafeInteger(input.size) || input.size <= 0) {
    throw uploadError("EMPTY_FILE", 400, "File is empty");
  }
  if (input.size > MAX_UPLOAD_SIZE_BYTES) {
    throw uploadError("FILE_TOO_LARGE", 413, "File too large (max 5MB)");
  }
  const contentType = normalizeContentType(input.contentType);
  assertExtensionMatches(filename, contentType);
  return { filename, contentType, size: input.size };
}

function startsWith(bytes: Buffer, signature: Buffer) {
  return bytes.length >= signature.length && bytes.subarray(0, signature.length).equals(signature);
}

function containsOleStream(bytes: Buffer, streamName: string) {
  return bytes.indexOf(Buffer.from(streamName, "utf16le"), OLE_SIGNATURE.length) >= 0;
}

function hasControlCharacters(value: string, allowTextWhitespace = false) {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint === 0x7f) return true;
    if (codePoint < 0x20 && (!allowTextWhitespace || ![0x09, 0x0a, 0x0d].includes(codePoint))) {
      return true;
    }
  }
  return false;
}

function assertText(bytes: Buffer) {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    contentMismatch();
  }
  if (hasControlCharacters(text, true)) contentMismatch();
}

function assertSafeZipEntryName(name: string) {
  if (
    !name ||
    name.length > 512 ||
    name.includes("\\") ||
    name.startsWith("/") ||
    hasControlCharacters(name)
  ) {
    contentMismatch();
  }
  const segments = name.replace(/\/$/, "").split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    contentMismatch();
  }
}

function assertZip(bytes: Buffer, kind: "docx" | "pptx" | "zip") {
  const entries = new Set<string>();
  let entryCount = 0;
  let fileCount = 0;
  let uncompressedBytes = 0;

  let extracted: Record<string, Uint8Array>;
  try {
    extracted = unzipSync(bytes, {
      filter(entry) {
        entryCount += 1;
        if (entryCount > MAX_ZIP_ENTRIES) contentMismatch();
        assertSafeZipEntryName(entry.name);
        if (entries.has(entry.name)) contentMismatch();
        entries.add(entry.name);

        if (
          !Number.isSafeInteger(entry.originalSize) ||
          entry.originalSize < 0 ||
          entry.originalSize > MAX_ZIP_ENTRY_BYTES ||
          !Number.isSafeInteger(entry.size) ||
          entry.size < 0 ||
          entry.size > bytes.length ||
          (entry.compression !== 0 && entry.compression !== 8)
        ) {
          contentMismatch();
        }
        uncompressedBytes += entry.originalSize;
        if (uncompressedBytes > MAX_ZIP_UNCOMPRESSED_BYTES) contentMismatch();

        const isDirectory = entry.name.endsWith("/");
        if (!isDirectory) fileCount += 1;
        if (kind === "zip") return !isDirectory;
        return (
          entry.name === "[Content_Types].xml" && entry.originalSize <= MAX_CONTENT_TYPES_BYTES
        );
      },
    });
  } catch (error) {
    if (error instanceof UploadValidationError) throw error;
    contentMismatch();
  }

  if (entryCount === 0 || fileCount === 0) contentMismatch();
  if (kind === "zip") return;

  const mainPart = kind === "docx" ? "word/document.xml" : "ppt/presentation.xml";
  const requiredContentType =
    kind === "docx"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
      : "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml";
  if (
    !entries.has("[Content_Types].xml") ||
    !entries.has("_rels/.rels") ||
    !entries.has(mainPart)
  ) {
    contentMismatch();
  }

  const contentTypes = extracted["[Content_Types].xml"];
  if (!contentTypes) contentMismatch();
  let contentTypesXml: string;
  try {
    contentTypesXml = new TextDecoder("utf-8", { fatal: true }).decode(contentTypes);
  } catch {
    contentMismatch();
  }
  if (!contentTypesXml.includes(requiredContentType)) contentMismatch();
}

function validateUploadContent(bytes: Buffer, contentType: string) {
  const kind = TYPE_RULES[contentType].kind;
  if (kind === "pdf") {
    if (!startsWith(bytes, Buffer.from("%PDF-", "ascii"))) contentMismatch();
    if (!bytes.subarray(Math.max(0, bytes.length - 1024)).includes(Buffer.from("%%EOF", "ascii"))) {
      contentMismatch();
    }
    return;
  }
  if (kind === "png") {
    if (!startsWith(bytes, PNG_SIGNATURE)) contentMismatch();
    return;
  }
  if (kind === "jpeg") {
    if (
      bytes.length < 5 ||
      bytes[0] !== 0xff ||
      bytes[1] !== 0xd8 ||
      bytes[2] !== 0xff ||
      bytes.at(-2) !== 0xff ||
      bytes.at(-1) !== 0xd9
    ) {
      contentMismatch();
    }
    return;
  }
  if (kind === "gif") {
    const header = bytes.subarray(0, 6).toString("ascii");
    if (header !== "GIF87a" && header !== "GIF89a") contentMismatch();
    return;
  }
  if (kind === "webp") {
    if (
      bytes.length < 16 ||
      bytes.subarray(0, 4).toString("ascii") !== "RIFF" ||
      bytes.subarray(8, 12).toString("ascii") !== "WEBP" ||
      !["VP8 ", "VP8L", "VP8X"].includes(bytes.subarray(12, 16).toString("ascii"))
    ) {
      contentMismatch();
    }
    return;
  }
  if (kind === "text") {
    assertText(bytes);
    return;
  }
  if (kind === "doc" || kind === "ppt") {
    const streamName = kind === "doc" ? "WordDocument" : "PowerPoint Document";
    if (!startsWith(bytes, OLE_SIGNATURE) || !containsOleStream(bytes, streamName)) {
      contentMismatch();
    }
    return;
  }
  assertZip(bytes, kind);
}

export async function normalizeUploadInput(file: UploadInput, options: UploadOptions) {
  if (isFileLike(file)) {
    const fileContentType = normalizeContentType(file.type);
    const requestedContentType = options.contentType
      ? normalizeContentType(options.contentType)
      : fileContentType;
    if (requestedContentType !== fileContentType) {
      throw uploadError("TYPE_MISMATCH", 415, "File content does not match its type");
    }

    const fileName = safeFilename(file.name);
    const metadata = validateUploadMetadata({
      filename: options.filename,
      size: file.size,
      contentType: requestedContentType,
    });
    if (fileName !== metadata.filename) {
      throw uploadError("FILENAME_MISMATCH", 400, "Invalid filename");
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length !== metadata.size || bytes.length > MAX_UPLOAD_SIZE_BYTES) {
      throw uploadError("SIZE_MISMATCH", 413, "File size does not match upload metadata");
    }
    validateUploadContent(bytes, metadata.contentType);
    return { ...metadata, bytes };
  }

  if (Buffer.isBuffer(file)) {
    const metadata = validateUploadMetadata({
      filename: options.filename,
      size: file.length,
      contentType: options.contentType ?? "",
    });
    validateUploadContent(file, metadata.contentType);
    return { ...metadata, bytes: file };
  }

  throw uploadError("UNSUPPORTED_INPUT", 400, "Unsupported upload input");
}
