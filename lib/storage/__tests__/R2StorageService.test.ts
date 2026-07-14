// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { uploadFixtures } from "@/tests/helpers/upload-fixtures";

const sdkMocks = vi.hoisted(() => ({
  clientConfigs: [] as Array<Record<string, unknown>>,
  commandInputs: {
    delete: [] as Array<Record<string, unknown>>,
    get: [] as Array<Record<string, unknown>>,
    put: [] as Array<Record<string, unknown>>,
  },
  getSignedUrl: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    readonly send = sdkMocks.send;

    constructor(config: Record<string, unknown>) {
      sdkMocks.clientConfigs.push(config);
    }
  }

  class PutObjectCommand {
    constructor(readonly input: Record<string, unknown>) {
      sdkMocks.commandInputs.put.push(input);
    }
  }

  class GetObjectCommand {
    constructor(readonly input: Record<string, unknown>) {
      sdkMocks.commandInputs.get.push(input);
    }
  }

  class DeleteObjectCommand {
    constructor(readonly input: Record<string, unknown>) {
      sdkMocks.commandInputs.delete.push(input);
    }
  }

  return { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: sdkMocks.getSignedUrl,
}));

import { type R2StorageConfig, R2StorageService } from "@/lib/storage/R2StorageService";
import { storageUrlForKey } from "@/lib/storage/storage-url";

const accountId = "0123456789abcdef0123456789abcdef";
const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
const bucket = "ulu-school-private";
const accessKeyId = "r2-access-key-value";
const secretAccessKey = "r2-secret-key-value";
const validKey = "private/teachers/teacher-1/materials/file-id-lesson.pdf";

const config: R2StorageConfig = {
  endpoint,
  bucket,
  accessKeyId,
  secretAccessKey,
};

const originalEnv = { ...process.env };

function createService(overrides: Partial<R2StorageConfig> = {}) {
  return new R2StorageService({ ...config, ...overrides });
}

function setR2Env(overrides: Partial<NodeJS.ProcessEnv> = {}) {
  process.env.STORAGE_DRIVER = "r2";
  process.env.R2_ENDPOINT = endpoint;
  process.env.R2_BUCKET_NAME = bucket;
  process.env.R2_ACCESS_KEY_ID = accessKeyId;
  process.env.R2_SECRET_ACCESS_KEY = secretAccessKey;
  Object.assign(process.env, overrides);
}

function serializeError(error: unknown) {
  if (!(error instanceof Error)) return JSON.stringify(error);
  const record = error as Error & Record<string, unknown>;
  return JSON.stringify({
    name: error.name,
    message: error.message,
    stack: error.stack,
    code: record.code,
    cause: record.cause,
    ownProperties: { ...record },
  });
}

function sdkFailureWithSensitiveMetadata() {
  const signedUrl =
    "https://signed.example/private?X-Amz-Credential=fake-access&X-Amz-Signature=fake-signature";
  const requestId = "sdk-request-id-sensitive";
  const marker = "sdk-original-message-sensitive";
  const error = new Error(
    [
      marker,
      "UploadValidationError Invalid storage key Invalid download URL expiry Storage upload failed",
      endpoint,
      bucket,
      accessKeyId,
      secretAccessKey,
      validKey,
      signedUrl,
      requestId,
    ].join(" | "),
  );
  Object.assign(error, {
    $metadata: { requestId },
    requestId,
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    storageKey: validKey,
    signedUrl,
  });
  return {
    error,
    sensitiveValues: [
      marker,
      endpoint,
      bucket,
      accessKeyId,
      secretAccessKey,
      validKey,
      signedUrl,
      requestId,
      error.message,
    ],
  };
}

describe("R2StorageService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sdkMocks.clientConfigs.length = 0;
    sdkMocks.commandInputs.put.length = 0;
    sdkMocks.commandInputs.get.length = 0;
    sdkMocks.commandInputs.delete.length = 0;
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it.each([
    [`  ${endpoint}  `, endpoint],
    [`${endpoint}/`, endpoint],
    [
      `https://${accountId}.eu.r2.cloudflarestorage.com`,
      `https://${accountId}.eu.r2.cloudflarestorage.com`,
    ],
    [
      `https://${accountId}.fedramp.r2.cloudflarestorage.com`,
      `https://${accountId}.fedramp.r2.cloudflarestorage.com`,
    ],
  ])(
    "accepts a documented Cloudflare R2 account endpoint: %s",
    (configuredEndpoint, expectedEndpoint) => {
      createService({
        endpoint: configuredEndpoint,
        bucket: `  ${bucket}  `,
        accessKeyId: `  ${accessKeyId}  `,
        secretAccessKey: `  ${secretAccessKey}  `,
      });

      expect(sdkMocks.clientConfigs).toEqual([
        {
          region: "auto",
          endpoint: expectedEndpoint,
          credentials: { accessKeyId, secretAccessKey },
        },
      ]);
    },
  );

  it.each([
    ["endpoint", "R2_ENDPOINT"],
    ["bucket", "R2_BUCKET_NAME"],
    ["accessKeyId", "R2_ACCESS_KEY_ID"],
    ["secretAccessKey", "R2_SECRET_ACCESS_KEY"],
  ] as const)("rejects a missing %s before constructing an S3 client", (field, variableName) => {
    expect(() => createService({ [field]: "   " })).toThrow(variableName);
    expect(sdkMocks.clientConfigs).toHaveLength(0);
  });

  it.each([
    ["non-HTTPS", `http://${accountId}.r2.cloudflarestorage.com`],
    ["unrelated host", "https://example.com"],
    ["suffix trick", `${endpoint}.example.com`],
    ["bucket-prefixed host", `https://private.${accountId}.r2.cloudflarestorage.com`],
    ["unsupported jurisdiction", `https://${accountId}.apac.r2.cloudflarestorage.com`],
    ["misplaced jurisdiction", `https://eu.${accountId}.r2.cloudflarestorage.com`],
    ["missing account ID", "https://r2.cloudflarestorage.com"],
    ["short account ID", "https://0123456789abcdef.r2.cloudflarestorage.com"],
    ["non-hex account ID", `https://${"g".repeat(32)}.r2.cloudflarestorage.com`],
    ["path", `${endpoint}/objects`],
    ["explicit default port", `https://${accountId}.r2.cloudflarestorage.com:443`],
    ["explicit non-default port", `https://${accountId}.r2.cloudflarestorage.com:8443`],
    ["credentials", `https://user:password@${accountId}.r2.cloudflarestorage.com`],
    ["query", `${endpoint}?token=secret`],
    ["fragment", `${endpoint}#fragment`],
    ["malformed URL", "not-a-url"],
    ["unbounded URL", `https://${"a".repeat(2_050)}.r2.cloudflarestorage.com`],
  ])("rejects an endpoint with %s without exposing its value", (_, invalidEndpoint) => {
    let thrown: unknown;
    try {
      createService({ endpoint: invalidEndpoint });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("Invalid R2 configuration variable: R2_ENDPOINT");
    expect((thrown as Error).message).not.toContain(invalidEndpoint);
    expect((thrown as Error).message).not.toContain(bucket);
    expect((thrown as Error).message).not.toContain(accessKeyId);
    expect((thrown as Error).message).not.toContain(secretAccessKey);
    expect(sdkMocks.clientConfigs).toHaveLength(0);
  });

  it.each(["abc", "a-b", `a${"b".repeat(61)}c`])(
    "accepts a documented R2 bucket name: %s",
    (validBucket) => {
      createService({ bucket: `  ${validBucket}  ` });

      expect(sdkMocks.clientConfigs).toEqual([
        expect.objectContaining({
          credentials: { accessKeyId, secretAccessKey },
        }),
      ]);
    },
  );

  it.each([
    ["too short", "ab"],
    ["too long", `a${"b".repeat(62)}c`],
    ["uppercase", "School-files"],
    ["underscore", "school_files"],
    ["dot", "school.files"],
    ["leading hyphen", "-school"],
    ["trailing hyphen", "school-"],
    ["non-ASCII", "school-files-\u00e9"],
  ])("rejects a bucket that is %s without exposing its value", (_, invalidBucket) => {
    let thrown: unknown;
    try {
      createService({ bucket: invalidBucket });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("Invalid R2 configuration variable: R2_BUCKET_NAME");
    expect((thrown as Error).message).not.toContain(endpoint);
    expect((thrown as Error).message).not.toContain(accessKeyId);
    expect((thrown as Error).message).not.toContain(secretAccessKey);
    expect(sdkMocks.clientConfigs).toHaveLength(0);
  });

  it.each([
    ["accessKeyId", "a".repeat(513), "R2_ACCESS_KEY_ID"],
    ["secretAccessKey", "s".repeat(1_025), "R2_SECRET_ACCESS_KEY"],
  ] as const)("rejects an unbounded %s without exposing config", (field, value, variableName) => {
    expect(() => createService({ [field]: value })).toThrow(variableName);
    try {
      createService({ [field]: value });
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain(value);
      expect(message).not.toContain(endpoint);
      expect(message).not.toContain(bucket);
      expect(message).not.toContain(accessKeyId);
      expect(message).not.toContain(secretAccessKey);
    }
    expect(sdkMocks.clientConfigs).toHaveLength(0);
  });

  it.each([
    ["Buffer", () => Buffer.from(uploadFixtures.pdf)],
    ["File", () => new File([uploadFixtures.pdf], "lesson.pdf", { type: "application/pdf" })],
  ])(
    "uploads validated %s bytes with the private bucket, key, and content type",
    async (_, input) => {
      const service = createService();
      sdkMocks.send.mockResolvedValueOnce({});

      const storageKey = await service.upload(input(), {
        filename: "lesson.pdf",
        namespace: "private/teachers/teacher-1/materials",
        contentType: "application/pdf",
      });

      expect(storageKey).toMatch(
        /^private\/teachers\/teacher-1\/materials\/[0-9a-f-]+-lesson\.pdf$/,
      );
      expect(sdkMocks.commandInputs.put).toEqual([
        {
          Bucket: bucket,
          Key: storageKey,
          ContentType: "application/pdf",
          Body: expect.any(Buffer),
        },
      ]);
      expect(sdkMocks.commandInputs.put[0].Body).toEqual(Buffer.from(uploadFixtures.pdf));
      expect(sdkMocks.send).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["Buffer", () => Buffer.from("not a pdf")],
    ["File", () => new File(["not a pdf"], "lesson.pdf", { type: "application/pdf" })],
  ])("applies shared upload validation to invalid %s content before SDK work", async (_, input) => {
    const service = createService();

    await expect(
      service.upload(input(), {
        filename: "lesson.pdf",
        namespace: "private/teachers/teacher-1/materials",
        contentType: "application/pdf",
      }),
    ).rejects.toThrow(/content/i);

    expect(sdkMocks.commandInputs.put).toHaveLength(0);
    expect(sdkMocks.send).not.toHaveBeenCalled();
  });

  it("returns an application storage URL without endpoint, bucket, or signed URL data", () => {
    const service = createService();

    const result = service.getURL(validKey);

    expect(result).toBe(storageUrlForKey(validKey));
    expect(result).toMatch(/^\/api\/files\//);
    expect(result).not.toContain(endpoint);
    expect(result).not.toContain(bucket);
    expect(sdkMocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it.each([undefined, 60] as const)(
    "presigns GetObject with a maximum 60-second expiry",
    async (expiry) => {
      const service = createService();
      sdkMocks.getSignedUrl.mockResolvedValueOnce("https://signed.example/download");

      const result = await service.createDownloadURL(validKey, expiry);

      expect(result).toBe("https://signed.example/download");
      expect(sdkMocks.commandInputs.get).toEqual([{ Bucket: bucket, Key: validKey }]);
      expect(sdkMocks.getSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({ send: sdkMocks.send }),
        expect.objectContaining({ input: { Bucket: bucket, Key: validKey } }),
        { expiresIn: 60 },
      );
    },
  );

  it.each([0, -1, 61, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "60"])(
    "rejects invalid expiry %s before SDK work",
    async (expiry) => {
      const service = createService();

      await expect(service.createDownloadURL(validKey, expiry as number)).rejects.toThrow(
        /expiry/i,
      );
      expect(sdkMocks.commandInputs.get).toHaveLength(0);
      expect(sdkMocks.getSignedUrl).not.toHaveBeenCalled();
      expect(sdkMocks.send).not.toHaveBeenCalled();
    },
  );

  it("rejects invalid download keys before SDK work", async () => {
    const service = createService();

    await expect(service.createDownloadURL("../outside.pdf")).rejects.toThrow(/storage key/i);
    expect(sdkMocks.commandInputs.get).toHaveLength(0);
    expect(sdkMocks.getSignedUrl).not.toHaveBeenCalled();
    expect(sdkMocks.send).not.toHaveBeenCalled();
  });

  it("deletes only a validated requested key", async () => {
    const service = createService();
    sdkMocks.send.mockResolvedValueOnce({});

    await service.delete(validKey);

    expect(sdkMocks.commandInputs.delete).toEqual([{ Bucket: bucket, Key: validKey }]);
    expect(sdkMocks.send).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid delete keys before SDK work", async () => {
    const service = createService();

    await expect(service.delete("../outside.pdf")).rejects.toThrow(/storage key/i);
    expect(sdkMocks.commandInputs.delete).toHaveLength(0);
    expect(sdkMocks.send).not.toHaveBeenCalled();
  });

  it.each([
    ["upload", "STORAGE_UPLOAD_FAILED", "Storage upload failed"],
    ["download", "STORAGE_DOWNLOAD_FAILED", "Storage download failed"],
    ["delete", "STORAGE_DELETE_FAILED", "Storage delete failed"],
  ] as const)(
    "bounds %s SDK failures with a typed, value-free operation error",
    async (operation, expectedCode, expectedMessage) => {
      const adapterModule = await import("@/lib/storage/R2StorageService");
      const service = new adapterModule.R2StorageService(config);
      const failure = sdkFailureWithSensitiveMetadata();
      let promise: Promise<unknown>;

      if (operation === "upload") {
        sdkMocks.send.mockRejectedValueOnce(failure.error);
        promise = service.upload(Buffer.from(uploadFixtures.pdf), {
          filename: "lesson.pdf",
          namespace: "private/teachers/teacher-1/materials",
          contentType: "application/pdf",
        });
      } else if (operation === "download") {
        sdkMocks.getSignedUrl.mockRejectedValueOnce(failure.error);
        promise = service.createDownloadURL(validKey);
      } else {
        sdkMocks.send.mockRejectedValueOnce(failure.error);
        promise = service.delete(validKey);
      }

      let thrown: unknown;
      try {
        await promise;
      } catch (error) {
        thrown = error;
      }

      expect(adapterModule.StorageOperationError).toBeTypeOf("function");
      expect(thrown).toBeInstanceOf(adapterModule.StorageOperationError);
      expect(thrown).toMatchObject({
        name: "StorageOperationError",
        code: expectedCode,
        message: expectedMessage,
      });
      expect("cause" in (thrown as Error)).toBe(false);

      const serialized = serializeError(thrown);
      for (const sensitiveValue of failure.sensitiveValues) {
        expect(serialized).not.toContain(sensitiveValue);
      }
    },
  );

  it("exports StorageOperationError from the public storage module", async () => {
    const adapterModule = await import("@/lib/storage/R2StorageService");
    const publicModule = await import("@/lib/storage");

    expect(adapterModule.StorageOperationError).toBeTypeOf("function");
    expect(publicModule.StorageOperationError).toBe(adapterModule.StorageOperationError);
  });

  describe("storage factory", () => {
    it("selects R2 from trimmed case-insensitive env and caches by normalized driver", async () => {
      setR2Env({ STORAGE_DRIVER: "  R2  " });
      const { createStorageService } = await import("@/lib/storage");

      const first = createStorageService();
      process.env.R2_BUCKET_NAME = "changed-after-cache";
      const second = createStorageService();

      expect(first.constructor.name).toBe("R2StorageService");
      expect(second).toBe(first);
      expect(sdkMocks.clientConfigs).toHaveLength(1);
    });

    it("selects and caches local storage by its normalized driver", async () => {
      process.env.STORAGE_DRIVER = " local ";
      process.env.NODE_ENV = "development";
      const { createStorageService } = await import("@/lib/storage");

      const first = createStorageService();
      process.env.STORAGE_DRIVER = "LOCAL";
      const second = createStorageService();

      expect(first.constructor.name).toBe("LocalStorageService");
      expect(second).toBe(first);
      expect(sdkMocks.clientConfigs).toHaveLength(0);
    });

    it("never falls back to local when R2 configuration is incomplete", async () => {
      setR2Env({ R2_SECRET_ACCESS_KEY: "" });
      const { createStorageService } = await import("@/lib/storage");

      expect(() => createStorageService()).toThrow("R2_SECRET_ACCESS_KEY");
      expect(sdkMocks.clientConfigs).toHaveLength(0);
    });

    it("rejects unsupported drivers", async () => {
      process.env.STORAGE_DRIVER = "filesystem";
      const { createStorageService } = await import("@/lib/storage");

      expect(() => createStorageService()).toThrow(/unsupported storage driver/i);
      expect(sdkMocks.clientConfigs).toHaveLength(0);
    });

    it("retains the production local-storage fail-closed behavior even after a dev cache", async () => {
      process.env.STORAGE_DRIVER = "local";
      process.env.NODE_ENV = "development";
      const { createStorageService } = await import("@/lib/storage");
      createStorageService();
      process.env.NODE_ENV = "production";

      expect(() => createStorageService()).toThrow(/local storage.*production|production.*local/i);
      expect(sdkMocks.clientConfigs).toHaveLength(0);
    });
  });
});
