import { randomUUID } from "node:crypto";

const NAMESPACE_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;
const STORAGE_FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_NAMESPACE_LENGTH = 512;
const MAX_NAMESPACE_SEGMENT_LENGTH = 64;
const MAX_CLIENT_FILENAME_LENGTH = 255;
const MAX_STORAGE_FILENAME_LENGTH = 255;
export const MAX_STORAGE_KEY_LENGTH = 1_024;

function hasControlCharacters(value: string) {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

function validateNamespaceSegment(segment: string) {
  if (
    !segment ||
    segment.length > MAX_NAMESPACE_SEGMENT_LENGTH ||
    !NAMESPACE_SEGMENT_PATTERN.test(segment)
  ) {
    throw new Error("Invalid namespace segment");
  }
  return segment;
}

export function validateStorageNamespace(namespace: string) {
  if (
    typeof namespace !== "string" ||
    !namespace ||
    namespace.length > MAX_NAMESPACE_LENGTH ||
    namespace.includes("\\") ||
    hasControlCharacters(namespace)
  ) {
    throw new Error("Invalid storage namespace");
  }

  const segments = namespace.split("/");
  if (
    !segments.every((segment) => {
      try {
        validateNamespaceSegment(segment);
        return true;
      } catch {
        return false;
      }
    })
  ) {
    throw new Error("Invalid storage namespace");
  }
  if (segments[0] !== "private" && segments[0] !== "public") {
    throw new Error("Invalid storage namespace root");
  }
  return namespace;
}

export function sanitizeStorageFilename(raw: string) {
  if (typeof raw !== "string" || !raw || raw.length > MAX_CLIENT_FILENAME_LENGTH) {
    throw new Error("Invalid filename");
  }

  const basename = raw.split(/[\\/]/).at(-1)?.trim() ?? "";
  const sanitized = basename
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+/, "")
    .replace(/[.]+$/, "");

  if (
    !sanitized ||
    sanitized.length > MAX_STORAGE_FILENAME_LENGTH - 37 ||
    !STORAGE_FILENAME_PATTERN.test(sanitized)
  ) {
    throw new Error("Invalid filename");
  }
  return sanitized;
}

export function validateStorageKey(storageKey: string) {
  if (
    typeof storageKey !== "string" ||
    !storageKey ||
    storageKey.length > MAX_STORAGE_KEY_LENGTH ||
    storageKey.includes("\\") ||
    hasControlCharacters(storageKey)
  ) {
    throw new Error("Invalid storage key");
  }

  const segments = storageKey.split("/");
  if (segments.length < 2 || (segments[0] !== "private" && segments[0] !== "public")) {
    throw new Error("Invalid storage key root");
  }

  const filename = segments.at(-1) ?? "";
  const namespaceSegments = segments.slice(0, -1);
  if (
    !namespaceSegments.every(
      (segment) =>
        segment.length > 0 &&
        segment.length <= MAX_NAMESPACE_SEGMENT_LENGTH &&
        NAMESPACE_SEGMENT_PATTERN.test(segment),
    ) ||
    !filename ||
    filename.length > MAX_STORAGE_FILENAME_LENGTH ||
    filename === "." ||
    filename === ".." ||
    !STORAGE_FILENAME_PATTERN.test(filename)
  ) {
    throw new Error("Invalid storage key");
  }
  return storageKey;
}

export function buildStorageKey(namespace: string, filename: string) {
  const validNamespace = validateStorageNamespace(namespace);
  const safeFilename = sanitizeStorageFilename(filename);
  return validateStorageKey(`${validNamespace}/${randomUUID()}-${safeFilename}`);
}

function namespaceForIdentity(root: "private" | "public", identity: string, leaf?: string) {
  const validIdentity = validateNamespaceSegment(identity);
  return validateStorageNamespace(
    [root, "teachers", validIdentity, ...(leaf ? [leaf] : [])].join("/"),
  );
}

export const teacherMaterialNamespace = (teacherId: string) =>
  namespaceForIdentity("private", teacherId, "materials");

export const teacherReportNamespace = (teacherId: string) =>
  namespaceForIdentity("private", teacherId, "reports");

export const publicTeacherPhotoNamespace = (adminId: string) =>
  namespaceForIdentity("public", adminId);

export function isTeacherMaterialStorageKey(storageKey: string, teacherId: string) {
  try {
    const namespace = teacherMaterialNamespace(teacherId);
    const validStorageKey = validateStorageKey(storageKey);
    return validStorageKey.startsWith(`${namespace}/`);
  } catch {
    return false;
  }
}
