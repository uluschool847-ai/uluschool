import { MAX_STORAGE_KEY_LENGTH, validateStorageKey } from "@/lib/storage/storage-key";

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_STORAGE_TOKEN_LENGTH = Math.ceil((MAX_STORAGE_KEY_LENGTH * 4) / 3);

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
