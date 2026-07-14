import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { StorageService, UploadInput, UploadOptions } from "@/lib/storage/StorageService";
import { buildStorageKey, validateStorageKey } from "@/lib/storage/storage-key";
import { storageUrlForKey } from "@/lib/storage/storage-url";
import { normalizeUploadInput } from "@/lib/storage/upload-input";

const DEFAULT_DOWNLOAD_EXPIRY_SECONDS = 60;
const MAX_DOWNLOAD_EXPIRY_SECONDS = 60;
const MAX_ENDPOINT_LENGTH = 2_048;
const MAX_BUCKET_LENGTH = 255;
const MAX_ACCESS_KEY_ID_LENGTH = 512;
const MAX_SECRET_ACCESS_KEY_LENGTH = 1_024;

export type R2StorageConfig = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

function requireConfigValue(value: string, variableName: string, maximumLength: number) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    throw new Error(`Missing R2 configuration variable: ${variableName}`);
  }
  if (trimmed.length > maximumLength) {
    throw new Error(`Invalid R2 configuration variable: ${variableName}`);
  }
  return trimmed;
}

function validateEndpoint(value: string) {
  const endpoint = requireConfigValue(value, "R2_ENDPOINT", MAX_ENDPOINT_LENGTH);
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error("Invalid R2 configuration variable: R2_ENDPOINT");
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("Invalid R2 configuration variable: R2_ENDPOINT");
  }
  return endpoint;
}

function validateConfig(config: R2StorageConfig): R2StorageConfig {
  return {
    endpoint: validateEndpoint(config.endpoint),
    bucket: requireConfigValue(config.bucket, "R2_BUCKET_NAME", MAX_BUCKET_LENGTH),
    accessKeyId: requireConfigValue(
      config.accessKeyId,
      "R2_ACCESS_KEY_ID",
      MAX_ACCESS_KEY_ID_LENGTH,
    ),
    secretAccessKey: requireConfigValue(
      config.secretAccessKey,
      "R2_SECRET_ACCESS_KEY",
      MAX_SECRET_ACCESS_KEY_LENGTH,
    ),
  };
}

function validateExpiry(expiresInSeconds: number | undefined) {
  const expiry = expiresInSeconds ?? DEFAULT_DOWNLOAD_EXPIRY_SECONDS;
  if (!Number.isInteger(expiry) || expiry < 1 || expiry > MAX_DOWNLOAD_EXPIRY_SECONDS) {
    throw new Error("Invalid download URL expiry");
  }
  return expiry;
}

export class R2StorageService implements StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: R2StorageConfig) {
    const validated = validateConfig(config);
    this.bucket = validated.bucket;
    this.client = new S3Client({
      region: "auto",
      endpoint: validated.endpoint,
      credentials: {
        accessKeyId: validated.accessKeyId,
        secretAccessKey: validated.secretAccessKey,
      },
    });
  }

  async upload(file: UploadInput, options: UploadOptions): Promise<string> {
    const normalized = await normalizeUploadInput(file, options);
    const storageKey = buildStorageKey(options.namespace, options.filename);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        ContentType: normalized.contentType,
        Body: normalized.bytes,
      }),
    );
    return storageKey;
  }

  getURL(storageKey: string): string {
    return storageUrlForKey(storageKey);
  }

  async createDownloadURL(storageKey: string, expiresInSeconds?: number): Promise<string> {
    const validStorageKey = validateStorageKey(storageKey);
    const expiry = validateExpiry(expiresInSeconds);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: validStorageKey }),
      { expiresIn: expiry },
    );
  }

  async delete(storageKey: string): Promise<void> {
    const validStorageKey = validateStorageKey(storageKey);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: validStorageKey }));
  }
}
