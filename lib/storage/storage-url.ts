import {
  MAX_STORAGE_KEY_LENGTH,
  validateLegacyStorageKey,
  validateStorageKey,
} from "@/lib/storage/storage-key";

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const STORAGE_URL_PATTERN = /^\/api\/(files|public-files)\/([A-Za-z0-9_-]+)$/;
const MAX_STORAGE_TOKEN_LENGTH = Math.ceil((MAX_STORAGE_KEY_LENGTH * 4) / 3);

export type PersistedStorageReference = {
  aliases: string[];
  kind: "current" | "legacy";
  storageKey: string;
};

function hasCurrentStorageRoot(value: string) {
  const candidate = value.startsWith("/") ? value.slice(1) : value;
  return (
    candidate === "private" ||
    candidate.startsWith("private/") ||
    candidate === "public" ||
    candidate.startsWith("public/")
  );
}

function legacyReference(storageKey: string): PersistedStorageReference {
  const suffix = storageKey.slice("uploads/".length);
  return {
    aliases: [
      storageKey,
      `/${storageKey}`,
      `public/${storageKey}`,
      `/public/${storageKey}`,
      suffix,
    ],
    kind: "legacy",
    storageKey,
  };
}

export function encodeStorageKey(storageKey: string) {
  return Buffer.from(validateStorageKey(storageKey), "utf8").toString("base64url");
}

export function decodeStorageToken(token: string) {
  if (
    typeof token !== "string" ||
    !token ||
    token.length > MAX_STORAGE_TOKEN_LENGTH ||
    !BASE64URL_PATTERN.test(token)
  ) {
    throw new Error("Invalid storage token");
  }

  const storageKey = Buffer.from(token, "base64url").toString("utf8");
  if (!storageKey || Buffer.from(storageKey, "utf8").toString("base64url") !== token) {
    throw new Error("Invalid storage token");
  }
  return validateStorageKey(storageKey);
}

export function storageUrlForKey(storageKey: string) {
  const validStorageKey = validateStorageKey(storageKey);
  const route = validStorageKey.startsWith("public/") ? "/api/public-files" : "/api/files";
  return `${route}/${encodeStorageKey(validStorageKey)}`;
}

export function storageKeyFromUrl(storageUrl: string) {
  const match = STORAGE_URL_PATTERN.exec(storageUrl);
  if (!match) throw new Error("Invalid storage URL");

  const storageKey = decodeStorageToken(match[2]);
  const expectedRoute = storageKey.startsWith("public/") ? "public-files" : "files";
  if (match[1] !== expectedRoute) throw new Error("Invalid storage URL");
  return storageKey;
}

export function normalizePersistedStorageReference(
  value: unknown,
): PersistedStorageReference | null {
  if (typeof value !== "string" || !value || value !== value.trim()) return null;

  if (
    value.startsWith("uploads/") ||
    value.startsWith("/uploads/") ||
    value.startsWith("public/uploads/") ||
    value.startsWith("/public/uploads/")
  ) {
    try {
      return legacyReference(validateLegacyStorageKey(value));
    } catch {
      return null;
    }
  }

  try {
    const storageKey = validateStorageKey(value);
    return {
      aliases: [storageKey, storageUrlForKey(storageKey)],
      kind: "current",
      storageKey,
    };
  } catch {
    try {
      const storageKey = storageKeyFromUrl(value);
      return {
        aliases: [storageKey, storageUrlForKey(storageKey)],
        kind: "current",
        storageKey,
      };
    } catch {
      if (value.startsWith("/") || hasCurrentStorageRoot(value)) return null;
      try {
        return legacyReference(validateLegacyStorageKey(`uploads/${value}`));
      } catch {
        return null;
      }
    }
  }
}

export function storageUrlMatchesKey(storageUrl: string, storageKey: string) {
  try {
    return storageKeyFromUrl(storageUrl) === validateStorageKey(storageKey);
  } catch {
    return false;
  }
}

export function legacyStorageKeyFromUrl(storageUrl: string) {
  if (
    typeof storageUrl !== "string" ||
    (!storageUrl.startsWith("/uploads/") && !storageUrl.startsWith("/public/uploads/")) ||
    storageUrl.includes("?") ||
    storageUrl.includes("#")
  ) {
    throw new Error("Invalid legacy storage URL");
  }
  try {
    return validateLegacyStorageKey(storageUrl);
  } catch {
    throw new Error("Invalid legacy storage URL");
  }
}
