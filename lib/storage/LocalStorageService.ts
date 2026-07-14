import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { StorageService, UploadInput, UploadOptions } from "@/lib/storage/StorageService";
import { buildStorageKey, validateStorageKey } from "@/lib/storage/storage-key";
import { storageUrlForKey } from "@/lib/storage/storage-url";
import { normalizeUploadInput } from "@/lib/storage/upload-input";

const DEFAULT_UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

export class LocalStorageService implements StorageService {
  constructor(private readonly uploadRoot = DEFAULT_UPLOAD_ROOT) {}

  private resolveStoragePath(storageKey: string) {
    const validStorageKey = validateStorageKey(storageKey);
    const uploadRoot = path.resolve(this.uploadRoot);
    const absolutePath = path.resolve(uploadRoot, ...validStorageKey.split("/"));
    const relativePath = path.relative(uploadRoot, absolutePath);

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
    return `/uploads/${validStorageKey}`;
  }

  async delete(storageKey: string): Promise<void> {
    let absolutePath: string;
    try {
      absolutePath = this.resolveStoragePath(storageKey);
    } catch {
      return;
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
