import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { StorageService, UploadInput, UploadOptions } from "@/lib/storage/StorageService";
import {
  buildStorageKey,
  validateLegacyStorageKey,
  validateStorageKey,
} from "@/lib/storage/storage-key";
import { storageUrlForKey } from "@/lib/storage/storage-url";
import { normalizeUploadInput } from "@/lib/storage/upload-input";

const DEFAULT_UPLOAD_ROOT = path.join(process.cwd(), ".data", "uploads");
const DEFAULT_LEGACY_UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

export class LocalStorageService implements StorageService {
  constructor(
    private readonly uploadRoot = DEFAULT_UPLOAD_ROOT,
    private readonly legacyUploadRoot = DEFAULT_LEGACY_UPLOAD_ROOT,
  ) {}

  private resolveContainedPath(root: string, segments: string[]) {
    const resolvedRoot = path.resolve(root);
    const absolutePath = path.resolve(resolvedRoot, ...segments);
    const relativePath = path.relative(resolvedRoot, absolutePath);

    if (
      !relativePath ||
      relativePath === ".." ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath)
    ) {
      throw new Error("Invalid storage key path");
    }
    return absolutePath;
  }

  private resolveStoragePath(storageKey: string) {
    const validStorageKey = validateStorageKey(storageKey);
    return this.resolveContainedPath(this.uploadRoot, validStorageKey.split("/"));
  }

  private resolveLegacyStoragePath(storageKey: string) {
    const validStorageKey = validateLegacyStorageKey(storageKey);
    return this.resolveContainedPath(this.legacyUploadRoot, validStorageKey.split("/").slice(1));
  }

  async upload(file: UploadInput, options: UploadOptions): Promise<string> {
    const storageKey = buildStorageKey(options.namespace, options.filename);
    const normalized = await normalizeUploadInput(file, options);
    const absolutePath = this.resolveStoragePath(storageKey);

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, normalized.bytes);
    return storageKey;
  }

  getURL(storageKey: string): string {
    return storageUrlForKey(storageKey);
  }

  async createDownloadURL(storageKey: string): Promise<string> {
    const validStorageKey = validateStorageKey(storageKey);
    this.resolveStoragePath(validStorageKey);
    throw new Error("Local storage delivery is unavailable");
  }

  async delete(storageKey: string): Promise<void> {
    let absolutePath: string;
    try {
      absolutePath = this.resolveStoragePath(storageKey);
    } catch {
      try {
        absolutePath = this.resolveLegacyStoragePath(storageKey);
      } catch {
        return;
      }
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
