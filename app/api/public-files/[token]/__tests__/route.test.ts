// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizePhoto: vi.fn(),
  createDownloadURL: vi.fn(),
  createStorageService: vi.fn(),
  decodeStorageToken: vi.fn(),
}));

vi.mock("@/lib/repositories/file-access-repository", () => ({
  isPublishedTeacherPhoto: mocks.authorizePhoto,
}));
vi.mock("@/lib/storage", () => ({
  createStorageService: mocks.createStorageService,
  decodeStorageToken: mocks.decodeStorageToken,
}));

import * as route from "@/app/api/public-files/[token]/route";

const publicKey = "public/teachers/admin-1/photo.webp";
const secret = "r2-secret-value";
const originalStorageDriver = process.env.STORAGE_DRIVER;
const originalR2Endpoint = process.env.R2_ENDPOINT;
const originalR2Bucket = process.env.R2_BUCKET_NAME;

function context(token: string) {
  return { params: Promise.resolve({ token }) };
}

async function get(token = "valid-token") {
  return route.GET(new Request(`https://school.example/api/public-files/${token}`), context(token));
}

function expectPublicHeaders(response: Response) {
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
}

describe("GET /api/public-files/[token]", () => {
  beforeEach(() => {
    process.env.STORAGE_DRIVER = "local";
    Reflect.deleteProperty(process.env, "R2_ENDPOINT");
    mocks.decodeStorageToken.mockImplementation((token: string) => {
      if (token === "malformed") throw new Error(`invalid ${secret}`);
      if (token === "private-token") {
        return "private/teachers/teacher-1/materials/lesson.pdf";
      }
      return publicKey;
    });
    mocks.authorizePhoto.mockResolvedValue(true);
    mocks.createDownloadURL.mockResolvedValue("https://files.example.com/signed?token=opaque");
    mocks.createStorageService.mockReturnValue({
      createDownloadURL: mocks.createDownloadURL,
    });
  });

  afterEach(() => {
    if (originalStorageDriver === undefined) Reflect.deleteProperty(process.env, "STORAGE_DRIVER");
    else process.env.STORAGE_DRIVER = originalStorageDriver;
    if (originalR2Endpoint === undefined) Reflect.deleteProperty(process.env, "R2_ENDPOINT");
    else process.env.R2_ENDPOINT = originalR2Endpoint;
    if (originalR2Bucket === undefined) Reflect.deleteProperty(process.env, "R2_BUCKET_NAME");
    else process.env.R2_BUCKET_NAME = originalR2Bucket;
  });

  it("exports the Node runtime and GET only", () => {
    expect(route.runtime).toBe("nodejs");
    expect((route as Record<string, unknown>).POST).toBeUndefined();
  });

  it.each(["malformed", "private-token"])(
    "returns 400 for a malformed or private token without database or storage work: %s",
    async (token) => {
      const response = await get(token);

      expect(response.status).toBe(400);
      expect(mocks.authorizePhoto).not.toHaveBeenCalled();
      expect(mocks.createStorageService).not.toHaveBeenCalled();
      expectPublicHeaders(response);
    },
  );

  it("returns 404 for inactive or unreferenced photos without invoking the signer", async () => {
    mocks.authorizePhoto.mockResolvedValueOnce(false);

    const response = await get();

    expect(response.status).toBe(404);
    expect(mocks.createStorageService).not.toHaveBeenCalled();
    expect(mocks.createDownloadURL).not.toHaveBeenCalled();
    expectPublicHeaders(response);
  });

  it("authorizes before creating a 60-second HTTPS download redirect", async () => {
    const response = await get();

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://files.example.com/signed?token=opaque");
    expect(mocks.authorizePhoto).toHaveBeenCalledWith(publicKey);
    expect(mocks.authorizePhoto.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createStorageService.mock.invocationCallOrder[0],
    );
    expect(mocks.createDownloadURL).toHaveBeenCalledWith(publicKey, 60);
    expectPublicHeaders(response);
  });

  it.each([
    "http://files.example.com/signed",
    "/uploads/photo.webp",
    "javascript:alert(1)",
    "https://user:password@files.example.com/signed",
  ])("rejects an unsafe signed location with a bounded 503: %s", async (location) => {
    mocks.createDownloadURL.mockResolvedValueOnce(location);

    const response = await get();

    expect(response.status).toBe(503);
    expect(response.headers.get("Location")).toBeNull();
    expectPublicHeaders(response);
  });

  it("binds R2 redirects to the configured endpoint host", async () => {
    process.env.STORAGE_DRIVER = "r2";
    process.env.R2_ENDPOINT = "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com";
    process.env.R2_BUCKET_NAME = "ulu-school-private";
    mocks.createDownloadURL.mockResolvedValueOnce(
      "https://ulu-school-private.0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/key?sig=1",
    );

    const allowed = await get();
    expect(allowed.status).toBe(302);

    mocks.createDownloadURL.mockResolvedValueOnce("https://evil.example/signed");
    const rejected = await get();
    expect(rejected.status).toBe(503);
    expect(rejected.headers.get("Location")).toBeNull();
  });

  it.each(["repository", "storage factory", "storage signer"])(
    "bounds %s failures without key or configuration leakage",
    async (failure) => {
      const backendError = Object.assign(new Error(`${secret}: ${publicKey}`), {
        name: failure === "storage signer" ? "StorageOperationError" : "Error",
        code: "STORAGE_DOWNLOAD_FAILED",
      });
      if (failure === "repository") mocks.authorizePhoto.mockRejectedValueOnce(backendError);
      if (failure === "storage factory")
        mocks.createStorageService.mockImplementationOnce(() => {
          throw backendError;
        });
      if (failure === "storage signer") mocks.createDownloadURL.mockRejectedValueOnce(backendError);

      const response = await get();
      const body = await response.text();

      expect(response.status).toBe(503);
      expect(body).toBe('{"error":"Service unavailable"}');
      expect(body).not.toContain(secret);
      expect(body).not.toContain(publicKey);
      expectPublicHeaders(response);
    },
  );
});
