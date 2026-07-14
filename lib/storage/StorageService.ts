import type { Readable } from "node:stream";

export type UploadInput = File | Buffer | Readable;

export type UploadOptions = {
  filename: string;
  namespace: string;
  contentType?: string;
};

export type StorageService = {
  upload(file: UploadInput, options: UploadOptions): Promise<string>;
  getURL(storageKey: string): string;
  createDownloadURL(storageKey: string, expiresInSeconds?: number): Promise<string>;
  delete(storageKey: string): Promise<void>;
};
