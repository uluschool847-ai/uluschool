import { LocalStorageService } from "@/lib/storage/LocalStorageService";
import type { StorageService } from "@/lib/storage/StorageService";

const serviceCache = new Map<string, StorageService>();

function resolveStorageDriver() {
  const driver = (process.env.STORAGE_DRIVER ?? "local").trim().toLowerCase();
  if (driver !== "local") {
    throw new Error("Unsupported storage driver");
  }
  return driver;
}

export function createStorageService(): StorageService {
  const driver = resolveStorageDriver();
  if (driver === "local" && process.env.NODE_ENV === "production") {
    throw new Error("Local storage is unavailable in production without authorized delivery");
  }
  const cached = serviceCache.get(driver);
  if (cached) return cached;

  const service = new LocalStorageService();
  serviceCache.set(driver, service);
  return service;
}

export type {
  StorageService,
  UploadInput,
  UploadOptions,
} from "@/lib/storage/StorageService";
export {
  buildStorageKey,
  isTeacherMaterialStorageKey,
  publicTeacherPhotoNamespace,
  teacherMaterialNamespace,
  teacherReportNamespace,
  validateLegacyStorageKey,
  validateStorageKey,
} from "@/lib/storage/storage-key";
export {
  decodeStorageToken,
  encodeStorageKey,
  legacyStorageKeyFromUrl,
  storageKeyFromUrl,
  storageUrlForKey,
  storageUrlMatchesKey,
} from "@/lib/storage/storage-url";
