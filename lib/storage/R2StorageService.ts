import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { StorageService, UploadInput, UploadOptions } from "@/lib/storage/StorageService";
import {
  buildStorageKey,
  validateLegacyStorageKey,
  validateStorageKey,
} from "@/lib/storage/storage-key";
import { storageUrlForKey } from "@/lib/storage/storage-url";
import { normalizeUploadInput } from "@/lib/storage/upload-input";

const DEFAULT_DOWNLOAD_EXPIRY_SECONDS = 60;
const MAX_DOWNLOAD_EXPIRY_SECONDS = 60;
const MAX_ENDPOINT_LENGTH = 2_048;
const MIN_BUCKET_LENGTH = 3;
const MAX_BUCKET_LENGTH = 63;
const MAX_ACCESS_KEY_ID_LENGTH = 512;
const MAX_SECRET_ACCESS_KEY_LENGTH = 1_024;
const R2_ENDPOINT_PATTERN =
  /^https:\/\/[a-f0-9]{32}(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com\/?$/;
const R2_BUCKET_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/;

export type R2StorageConfig = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

const STORAGE_OPERATION_ERRORS = {
  upload: {
    code: "STORAGE_UPLOAD_FAILED",
    message: "Storage upload failed",
  },
  download: {
    code: "STORAGE_DOWNLOAD_FAILED",
    message: "Storage download failed",
  },
  delete: {
    code: "STORAGE_DELETE_FAILED",
    message: "Storage delete failed",
  },
} as const;

type StorageOperation = keyof typeof STORAGE_OPERATION_ERRORS;
export type StorageOperationCode = (typeof STORAGE_OPERATION_ERRORS)[StorageOperation]["code"];

export class StorageOperationError extends Error {
  readonly name = "StorageOperationError";
  readonly code: StorageOperationCode;

  constructor(operation: StorageOperation) {
    const definition = STORAGE_OPERATION_ERRORS[operation];
    super(definition.message);
    this.code = definition.code;
  }
}

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
    parsed.hash ||
    parsed.pathname !== "/" ||
    !R2_ENDPOINT_PATTERN.test(endpoint)
  ) {
    throw new Error("Invalid R2 configuration variable: R2_ENDPOINT");
  }
  return parsed.origin;
}

function validateBucket(value: string) {
  const bucket = requireConfigValue(value, "R2_BUCKET_NAME", MAX_BUCKET_LENGTH);
  if (bucket.length < MIN_BUCKET_LENGTH || !R2_BUCKET_PATTERN.test(bucket)) {
    throw new Error("Invalid R2 configuration variable: R2_BUCKET_NAME");
  }
  return bucket;
}

function validateConfig(config: R2StorageConfig): R2StorageConfig {
  return {
    endpoint: validateEndpoint(config.endpoint),
    bucket: validateBucket(config.bucket),
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

function validateDeletionStorageKey(storageKey: string) {
  try {
    return validateStorageKey(storageKey);
  } catch {
    return validateLegacyStorageKey(storageKey);
  }
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
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ContentType: normalized.contentType,
      Body: normalized.bytes,
    });
    try {
      await this.client.send(command);
    } catch {
      throw new StorageOperationError("upload");
    }
    return storageKey;
  }

  getURL(storageKey: string): string {
    return storageUrlForKey(storageKey);
  }

  async createDownloadURL(storageKey: string, expiresInSeconds?: number): Promise<string> {
    const validStorageKey = validateStorageKey(storageKey);
    const expiry = validateExpiry(expiresInSeconds);
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: validStorageKey });
    try {
      return await getSignedUrl(this.client, command, { expiresIn: expiry });
    } catch {
      throw new StorageOperationError("download");
    }
  }

  async delete(storageKey: string): Promise<void> {
    const validStorageKey = validateDeletionStorageKey(storageKey);
    const command = new DeleteObjectCommand({ Bucket: this.bucket, Key: validStorageKey });
    try {
      await this.client.send(command);
    } catch {
      throw new StorageOperationError("delete");
    }
  }
}
