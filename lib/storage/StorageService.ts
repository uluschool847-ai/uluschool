import type { Readable } from "node:stream";

export type UploadInput = File | Buffer | Readable;

export type StorageService = {
  upload(file: UploadInput, filename?: string): Promise<string>;
  getURL(storageKey: string): string;
  delete(storageKey: string): Promise<void>;
};

export type CreateStorageServiceOptions = {
  runtimeRole?: string;
};
