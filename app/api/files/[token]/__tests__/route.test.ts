// @vitest-environment node

import { UserRole } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  createDownloadURL: vi.fn(),
  createStorageService: vi.fn(),
  decodeStorageToken: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/repositories/file-access-repository", () => ({
  canAccessPrivateStorageKey: mocks.authorize,
}));
vi.mock("@/lib/storage", () => ({
  createStorageService: mocks.createStorageService,
  decodeStorageToken: mocks.decodeStorageToken,
}));

import * as route from "@/app/api/files/[token]/route";

const privateKey = "private/teachers/teacher-1/materials/lesson.pdf";
const secret = "r2-secret-value";
const originalStorageDriver = process.env.STORAGE_DRIVER;
const originalR2Endpoint = process.env.R2_ENDPOINT;
const originalR2Bucket = process.env.R2_BUCKET_NAME;

function context(token: string) {
  return { params: Promise.resolve({ token }) };
}

function request(token = "valid-token") {
  return new Request(`https://school.example/api/files/${token}`);
}

async function get(token = "valid-token") {
  return route.GET(request(token), context(token));
}

function expectPrivateHeaders(response: Response) {
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Vary")).toBe("Cookie");
  expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
}

describe("GET /api/files/[token]", () => {
  beforeEach(() => {
    process.env.STORAGE_DRIVER = "local";
    Reflect.deleteProperty(process.env, "R2_ENDPOINT");
    mocks.getSession.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    mocks.decodeStorageToken.mockImplementation((token: string) => {
      if (token === "malformed") throw new Error(`invalid ${secret}`);
      if (token === "public-token") return "public/teachers/admin-1/photo.webp";
      return privateKey;
    });
    mocks.authorize.mockResolvedValue(true);
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

  it("authenticates before parsing and returns 401 without touching the token", async () => {
    mocks.getSession.mockResolvedValueOnce(null);

    const response = await get("malformed");

    expect(response.status).toBe(401);
    expect(mocks.decodeStorageToken).not.toHaveBeenCalled();
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.createStorageService).not.toHaveBeenCalled();
    expectPrivateHeaders(response);
  });

  it.each(["malformed", "public-token"])(
    "returns 400 for a malformed or wrong-root token after authentication: %s",
    async (token) => {
      const response = await get(token);

      expect(response.status).toBe(400);
      expect(mocks.getSession.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.decodeStorageToken.mock.invocationCallOrder[0],
      );
      expect(mocks.authorize).not.toHaveBeenCalled();
      expect(mocks.createStorageService).not.toHaveBeenCalled();
      expectPrivateHeaders(response);
    },
  );

  it("returns 404 for unauthorized or unreferenced keys without invoking the signer", async () => {
    mocks.authorize.mockResolvedValueOnce(false);

    const response = await get();

    expect(response.status).toBe(404);
    expect(mocks.createStorageService).not.toHaveBeenCalled();
    expect(mocks.createDownloadURL).not.toHaveBeenCalled();
    expectPrivateHeaders(response);
  });

  it("authorizes before creating a 60-second HTTPS download redirect", async () => {
    const response = await get();

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://files.example.com/signed?token=opaque");
    expect(mocks.authorize).toHaveBeenCalledWith(
      { uid: "teacher-1", role: UserRole.TEACHER },
      privateKey,
    );
    expect(mocks.authorize.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createStorageService.mock.invocationCallOrder[0],
    );
    expect(mocks.createDownloadURL).toHaveBeenCalledWith(privateKey, 60);
    expectPrivateHeaders(response);
  });

  it.each([
    "http://files.example.com/signed",
    "/uploads/private-file.pdf",
    "javascript:alert(1)",
    "https://user:password@files.example.com/signed",
  ])("rejects an unsafe signed location with a bounded 503: %s", async (location) => {
    mocks.createDownloadURL.mockResolvedValueOnce(location);

    const response = await get();

    expect(response.status).toBe(503);
    expect(response.headers.get("Location")).toBeNull();
    expectPrivateHeaders(response);
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
    "bounds %s failures as generic 503 responses",
    async (failure) => {
      const backendError = Object.assign(new Error(`${secret}: ${privateKey}`), {
        name: failure === "storage signer" ? "StorageOperationError" : "Error",
        code: "STORAGE_DOWNLOAD_FAILED",
      });
      if (failure === "repository") mocks.authorize.mockRejectedValueOnce(backendError);
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
      expect(body).not.toContain(privateKey);
      expectPrivateHeaders(response);
    },
  );
});
