import { LocalStorageService } from "@/lib/storage/LocalStorageService";
import type { CreateStorageServiceOptions, StorageService } from "@/lib/storage/StorageService";

const serviceCache = new Map<string, StorageService>();

export function createStorageService(options: CreateStorageServiceOptions = {}): StorageService {
  const runtimeRole = (options.runtimeRole ?? "DEVELOPER").toUpperCase();
  const cacheKey = runtimeRole;

  const cached = serviceCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const service = new LocalStorageService();
  serviceCache.set(cacheKey, service);
  return service;
}

export type {
  CreateStorageServiceOptions,
  StorageService,
  UploadInput,
} from "@/lib/storage/StorageService";
