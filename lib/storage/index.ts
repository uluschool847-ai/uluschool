import { LocalStorageService } from "@/lib/storage/LocalStorageService";
import { R2StorageService } from "@/lib/storage/R2StorageService";
import type { StorageService } from "@/lib/storage/StorageService";

const serviceCache = new Map<string, StorageService>();

function resolveStorageDriver() {
  const driver = (process.env.STORAGE_DRIVER ?? "local").trim().toLowerCase();
  if (driver !== "local" && driver !== "r2") {
    throw new Error("Unsupported storage driver");
  }
  return driver;
}

export function createStorageService(): StorageService {
  const driver = resolveStorageDriver();
  if (driver === "local" && (process.env.NODE_ENV ?? "development") === "production") {
    throw new Error("Local storage is unavailable in production without authorized delivery");
  }
  const cached = serviceCache.get(driver);
  if (cached) return cached;

  const service =
    driver === "r2"
      ? new R2StorageService({
          endpoint: process.env.R2_ENDPOINT ?? "",
          bucket: process.env.R2_BUCKET_NAME ?? "",
          accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
        })
      : new LocalStorageService();
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
export { StorageOperationError } from "@/lib/storage/R2StorageService";
