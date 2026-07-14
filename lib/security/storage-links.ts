import { validateLegacyStorageKey } from "@/lib/storage/storage-key";
import {
  legacyStorageKeyFromUrl,
  storageKeyFromUrl,
  storageUrlForKey,
} from "@/lib/storage/storage-url";

function hasControlCharacters(value: string) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

export function safeStoredFileHref(value: string | null | undefined) {
  if (!value || value !== value.trim() || hasControlCharacters(value)) return null;

  if (value.startsWith("/api/")) {
    try {
      storageKeyFromUrl(value);
      return value;
    } catch {
      return null;
    }
  }

  if (value.startsWith("/uploads/") || value.startsWith("/public/uploads/")) {
    try {
      legacyStorageKeyFromUrl(value);
      return value;
    } catch {
      return null;
    }
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return value;
  } catch {
    return null;
  }
}

export function storageHrefForKey(storageKey: string | null | undefined) {
  if (!storageKey) return null;

  try {
    return storageUrlForKey(storageKey);
  } catch {
    try {
      return `/${validateLegacyStorageKey(storageKey)}`;
    } catch {
      try {
        return `/${validateLegacyStorageKey(`uploads/${storageKey}`)}`;
      } catch {
        return null;
      }
    }
  }
}

export function preferredStoredFileHref(
  storageKey: string | null | undefined,
  fallback: string | null | undefined,
) {
  return storageHrefForKey(storageKey) ?? safeStoredFileHref(fallback);
}
