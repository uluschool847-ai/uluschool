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

const endpoint = "https://account-id.r2.cloudflarestorage.com";
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

  it("trims validated configuration and constructs a Cloudflare R2 S3 client", () => {
    createService({
      endpoint: `  ${endpoint}  `,
      bucket: `  ${bucket}  `,
      accessKeyId: `  ${accessKeyId}  `,
      secretAccessKey: `  ${secretAccessKey}  `,
    });

    expect(sdkMocks.clientConfigs).toEqual([
      {
        region: "auto",
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
      },
    ]);
  });

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
    ["http://account-id.r2.cloudflarestorage.com", "R2_ENDPOINT"],
    ["https://user:password@account-id.r2.cloudflarestorage.com", "R2_ENDPOINT"],
    [`${endpoint}?token=secret`, "R2_ENDPOINT"],
    [`${endpoint}#fragment`, "R2_ENDPOINT"],
    ["not-a-url", "R2_ENDPOINT"],
    [`https://${"a".repeat(2_050)}.example.com`, "R2_ENDPOINT"],
  ])("rejects an invalid endpoint without exposing its value", (invalidEndpoint, variableName) => {
    let thrown: unknown;
    try {
      createService({ endpoint: invalidEndpoint });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain(variableName);
    expect((thrown as Error).message).not.toContain(invalidEndpoint);
    expect((thrown as Error).message).not.toContain(bucket);
    expect((thrown as Error).message).not.toContain(accessKeyId);
    expect((thrown as Error).message).not.toContain(secretAccessKey);
    expect(sdkMocks.clientConfigs).toHaveLength(0);
  });

  it.each([
    ["bucket", "b".repeat(256), "R2_BUCKET_NAME"],
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

  it.each(["upload", "sign", "delete"] as const)(
    "propagates %s backend failures without adding endpoint or bucket values",
    async (operation) => {
      const service = createService();
      const backendError = new Error(`${operation} backend unavailable`);
      let promise: Promise<unknown>;

      if (operation === "upload") {
        sdkMocks.send.mockRejectedValueOnce(backendError);
        promise = service.upload(Buffer.from(uploadFixtures.pdf), {
          filename: "lesson.pdf",
          namespace: "private/teachers/teacher-1/materials",
          contentType: "application/pdf",
        });
      } else if (operation === "sign") {
        sdkMocks.getSignedUrl.mockRejectedValueOnce(backendError);
        promise = service.createDownloadURL(validKey);
      } else {
        sdkMocks.send.mockRejectedValueOnce(backendError);
        promise = service.delete(validKey);
      }

      let thrown: unknown;
      try {
        await promise;
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBe(backendError);
      expect((thrown as Error).message).not.toContain(endpoint);
      expect((thrown as Error).message).not.toContain(bucket);
    },
  );

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
