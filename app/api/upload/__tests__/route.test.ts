// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const uploadMock = vi.hoisted(() => vi.fn());
const getURLMock = vi.hoisted(() => vi.fn());
const deleteMock = vi.hoisted(() => vi.fn());
const getSessionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage")>()),
  createStorageService: () => ({
    upload: uploadMock,
    getURL: getURLMock,
    delete: deleteMock,
  }),
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: getSessionMock,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
  },
}));

import { POST } from "@/app/api/upload/route";
import { storageUrlForKey } from "@/lib/storage/storage-url";

const MAX_UPLOAD_FILE_COUNT = 10;
const MAX_UPLOAD_AGGREGATE_BYTES = 20 * 1024 * 1024;
const MAX_UPLOAD_REQUEST_BYTES = 21 * 1024 * 1024;

function requestFromForm(form: FormData, headers?: HeadersInit) {
  return new Request("http://localhost/api/upload", {
    method: "POST",
    headers,
    body: form,
  });
}

function buildUploadRequest(
  input: {
    roleHeader?: string;
    purpose?: string;
    file?: File;
  } = {},
) {
  const form = new FormData();
  form.append("purpose", input.purpose ?? "course-material");
  const file = input.file ?? new File(["content"], "lesson.pdf", { type: "application/pdf" });
  form.append("file", file, file.name);

  return requestFromForm(form, input.roleHeader ? { "x-role": input.roleHeader } : undefined);
}

describe("app/api/upload/route local-first upload integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getSessionMock.mockResolvedValue({
      uid: "teacher-1",
      role: "TEACHER",
      email: "teacher@example.com",
      exp: Date.now() + 60_000,
      mfaVerified: true,
      authMethod: "password",
    });
  });

  it("returns 201 with upload metadata for an authorized teacher", async () => {
    const storageKey = "private/teachers/teacher-1/materials/1234-homework.pdf";
    const publicUrl = storageUrlForKey(storageKey);
    uploadMock.mockResolvedValueOnce(storageKey);
    getURLMock.mockReturnValueOnce(publicUrl);

    const response = await POST(
      buildUploadRequest({
        file: new File(["hello"], "homework.pdf", { type: "application/pdf" }),
      }),
    );

    expect(response.status).toBe(201);
    expect(uploadMock).toHaveBeenCalledWith(expect.any(File), {
      filename: "homework.pdf",
      namespace: "private/teachers/teacher-1/materials",
      contentType: "application/pdf",
    });
    expect(await response.json()).toEqual(
      expect.objectContaining({
        success: true,
        fileId: storageKey,
        url: publicUrl,
        storageKey,
        publicUrl,
        filename: expect.any(String),
        mimeType: "application/pdf",
        size: expect.any(Number),
      }),
    );
  });

  it("returns 401 without a revalidated session", async () => {
    getSessionMock.mockResolvedValueOnce(null);

    const response = await POST(buildUploadRequest({ roleHeader: "TEACHER" }));

    expect(response.status).toBe(401);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it.each(["STUDENT", "PARENT"])("returns 403 for %s", async (role) => {
    getSessionMock.mockResolvedValueOnce({
      uid: `${role.toLowerCase()}-1`,
      role,
      email: `${role.toLowerCase()}@example.com`,
      exp: Date.now() + 60_000,
      mfaVerified: true,
      authMethod: "password",
    });

    const response = await POST(buildUploadRequest({ roleHeader: "TEACHER" }));

    expect(response.status).toBe(403);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("ignores a forged x-role header", async () => {
    getSessionMock.mockResolvedValueOnce(null);

    const response = await POST(buildUploadRequest({ roleHeader: "TEACHER" }));

    expect(response.status).toBe(401);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects a teacher upload for an unapproved purpose", async () => {
    const response = await POST(buildUploadRequest({ purpose: "teacher-photo" }));

    expect(response.status).toBe(403);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it.each(["course-material", "teacher-photo"])(
    "allows an admin upload for %s",
    async (purpose) => {
      getSessionMock.mockResolvedValueOnce({
        uid: "admin-1",
        role: "ADMIN",
        email: "admin@example.com",
        exp: Date.now() + 60_000,
        mfaVerified: true,
        authMethod: "password",
      });
      const storageKey =
        purpose === "teacher-photo"
          ? "public/teachers/admin-1/00000000-0000-4000-8000-000000000001-teacher-photo.pdf"
          : "private/teachers/admin-1/materials/00000000-0000-4000-8000-000000000001-course-material.pdf";
      const publicUrl = storageUrlForKey(storageKey);
      uploadMock.mockResolvedValueOnce(storageKey);
      getURLMock.mockReturnValueOnce(publicUrl);

      const response = await POST(buildUploadRequest({ purpose }));

      expect(response.status).toBe(201);
      expect(uploadMock).toHaveBeenCalledWith(expect.any(File), {
        filename: "lesson.pdf",
        namespace:
          purpose === "teacher-photo"
            ? "public/teachers/admin-1"
            : "private/teachers/admin-1/materials",
        contentType: "application/pdf",
      });
      expect(await response.json()).toEqual(
        expect.objectContaining({
          success: true,
          storageKey,
          publicUrl,
          filename: expect.any(String),
          mimeType: "application/pdf",
          size: expect.any(Number),
        }),
      );
    },
  );

  it("rejects an admin upload for an unapproved purpose", async () => {
    getSessionMock.mockResolvedValueOnce({
      uid: "admin-1",
      role: "ADMIN",
      email: "admin@example.com",
      exp: Date.now() + 60_000,
      mfaVerified: true,
      authMethod: "password",
    });

    const response = await POST(buildUploadRequest({ purpose: "profile-photo" }));

    expect(response.status).toBe(403);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown upload purpose", async () => {
    const response = await POST(buildUploadRequest({ purpose: "profile-photo" }));

    expect(response.status).toBe(403);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects request when file is missing", async () => {
    const form = new FormData();
    form.append("purpose", "course-material");

    const response = await POST(
      new Request("http://localhost/api/upload", {
        method: "POST",
        body: form,
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: expect.stringMatching(/file/i),
    });
  });

  it("should handle malformed multipart payload with 400", async () => {
    const response = await POST(
      new Request("http://localhost/api/upload", {
        method: "POST",
        headers: {
          "content-type": "multipart/form-data; boundary=broken",
        },
        body: "--broken\r\nnot-valid-form-data" as BodyInit,
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: expect.stringMatching(/(multipart|payload|bad request)/i),
    });
  });

  it("rejects a declared oversized body before formData parsing", async () => {
    const formData = vi.fn(async () => new FormData());
    const response = await POST({
      headers: new Headers({ "content-length": String(MAX_UPLOAD_REQUEST_BYTES + 1) }),
      formData,
    } as unknown as Request);

    expect(response.status).toBe(413);
    expect(formData).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("fails closed instead of parsing an unbounded bodyless formData shim", async () => {
    const form = new FormData();
    form.append("purpose", "course-material");
    form.append("file", new File(["note"], "note.txt", { type: "text/plain" }));
    const formData = vi.fn(async () => form);

    const response = await POST({ headers: new Headers(), formData } as unknown as Request);

    expect(response.status).toBe(400);
    expect(formData).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized stream when Content-Length is absent", async () => {
    const request = new Request("http://localhost/api/upload", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=bounded" },
      body: new Uint8Array(MAX_UPLOAD_REQUEST_BYTES + 1),
    });
    expect(request.headers.has("content-length")).toBe(false);

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects excessive file count before any storage upload", async () => {
    const form = new FormData();
    form.append("purpose", "course-material");
    for (let index = 0; index <= MAX_UPLOAD_FILE_COUNT; index += 1) {
      form.append(
        "files",
        new File(["note"], `note-${index}.txt`, { type: "text/plain" }),
        `note-${index}.txt`,
      );
    }

    const response = await POST(requestFromForm(form));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error: "Too many files" });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("counts files in unexpected multipart fields toward the file-count limit", async () => {
    const form = new FormData();
    form.append("purpose", "course-material");
    form.append("file", new File(["note"], "note.txt", { type: "text/plain" }));
    for (let index = 0; index < MAX_UPLOAD_FILE_COUNT; index += 1) {
      form.append(
        `unexpected-${index}`,
        new File(["note"], `extra-${index}.txt`, { type: "text/plain" }),
      );
    }

    const response = await POST(requestFromForm(form));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error: "Too many files" });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects excessive aggregate file bytes before any storage upload", async () => {
    const form = new FormData();
    form.append("purpose", "course-material");
    const perFileBytes = Math.floor(MAX_UPLOAD_AGGREGATE_BYTES / 5) + 1;
    for (let index = 0; index < 5; index += 1) {
      form.append(
        "files",
        new File([new Uint8Array(perFileBytes)], `bundle-${index}.zip`, {
          type: "application/zip",
        }),
        `bundle-${index}.zip`,
      );
    }

    const response = await POST(requestFromForm(form));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      success: false,
      error: "Combined files are too large",
    });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("counts files in unexpected multipart fields toward the aggregate limit", async () => {
    const form = new FormData();
    form.append("purpose", "course-material");
    form.append("file", new File(["note"], "note.txt", { type: "text/plain" }));
    const perFileBytes = Math.floor(MAX_UPLOAD_AGGREGATE_BYTES / 5) + 1;
    for (let index = 0; index < 5; index += 1) {
      form.append(
        `unexpected-${index}`,
        new File([new Uint8Array(perFileBytes)], `extra-${index}.zip`, {
          type: "application/zip",
        }),
      );
    }

    const response = await POST(requestFromForm(form));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      success: false,
      error: "Combined files are too large",
    });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects invalid MIME type", async () => {
    const form = new FormData();
    form.append("purpose", "course-material");
    form.append("file", new File(["x"], "exploit.html", { type: "text/html" }), "exploit.html");

    const response = await POST(
      new Request("http://localhost/api/upload", {
        method: "POST",
        body: form,
      }),
    );

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({
      success: false,
      error: expect.stringMatching(/(mime|type|allowed)/i),
    });
  });

  it("rejects image subtypes outside the strict MIME allowlist", async () => {
    const response = await POST(
      buildUploadRequest({
        file: new File(["<svg />"], "diagram.svg", { type: "image/svg+xml" }),
      }),
    );

    expect(response.status).toBe(415);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects an unbounded filename before invoking storage", async () => {
    const response = await POST(
      buildUploadRequest({
        file: new File(["content"], `${"a".repeat(256)}.pdf`, {
          type: "application/pdf",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("ignores client namespace input and derives it from the signed session", async () => {
    const storageKey = "private/teachers/teacher-1/materials/1234-lesson.pdf";
    uploadMock.mockResolvedValueOnce(storageKey);
    getURLMock.mockReturnValueOnce(storageUrlForKey(storageKey));
    const form = new FormData();
    form.append("purpose", "course-material");
    form.append("namespace", "private/teachers/teacher-2/materials");
    form.append(
      "file",
      new File(["content"], "lesson.pdf", { type: "application/pdf" }),
      "lesson.pdf",
    );

    const response = await POST(requestFromForm(form));

    expect(response.status).toBe(201);
    expect(uploadMock).toHaveBeenCalledWith(expect.any(File), {
      filename: "lesson.pdf",
      namespace: "private/teachers/teacher-1/materials",
      contentType: "application/pdf",
    });
  });

  it.each([
    ["PDF", "worksheet.pdf", "application/pdf"],
    ["DOC", "lesson.doc", "application/msword"],
    [
      "DOCX",
      "lesson.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    ["PPT", "slides.ppt", "application/vnd.ms-powerpoint"],
    [
      "PPTX",
      "slides.pptx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
    ["ZIP", "materials.zip", "application/zip"],
    ["PNG image", "diagram.png", "image/png"],
  ])("accepts allowed course material MIME type: %s", async (_label, filename, mimeType) => {
    const storageKey = `private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000001-${filename}`;
    const publicUrl = storageUrlForKey(storageKey);
    uploadMock.mockResolvedValueOnce(storageKey);
    getURLMock.mockReturnValueOnce(publicUrl);

    const form = new FormData();
    form.append("purpose", "course-material");
    form.append("file", new File(["content"], filename, { type: mimeType }), filename);

    const response = await POST(
      new Request("http://localhost/api/upload", {
        method: "POST",
        body: form,
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        success: true,
        storageKey,
        publicUrl,
        filename,
        mimeType,
        size: expect.any(Number),
      }),
    );
  });

  it("rejects file over 5MB", async () => {
    const sixMb = new Uint8Array(6 * 1024 * 1024);
    const form = new FormData();
    form.append("purpose", "course-material");
    form.append("file", new File([sixMb], "big.zip", { type: "application/zip" }), "big.zip");
    const response = await POST(requestFromForm(form));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      success: false,
      error: expect.stringMatching(/(5mb|too large|size)/i),
    });
  });

  it("should reject zero-byte files with 400", async () => {
    const form = new FormData();
    form.append("purpose", "course-material");
    form.append(
      "file",
      new File([new Uint8Array(0)], "empty.pdf", { type: "application/pdf" }),
      "empty.pdf",
    );
    const response = await POST(requestFromForm(form));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: expect.stringMatching(/(empty|zero|size)/i),
    });
  });

  it("should report partial failure in batch upload when one file is invalid", async () => {
    const pdfKey =
      "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000001-a.pdf";
    const zipKey =
      "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000002-c.zip";
    uploadMock
      .mockResolvedValueOnce(pdfKey)
      .mockRejectedValueOnce(new Error("MIME type not allowed"))
      .mockResolvedValueOnce(zipKey);
    getURLMock
      .mockReturnValueOnce(storageUrlForKey(pdfKey))
      .mockReturnValueOnce(storageUrlForKey(zipKey));

    const form = new FormData();
    form.append("purpose", "course-material");
    form.append("files", new File(["a"], "a.pdf", { type: "application/pdf" }), "a.pdf");
    form.append("files", new File(["b"], "b.exe", { type: "application/x-msdownload" }), "b.exe");
    form.append("files", new File(["c"], "c.zip", { type: "application/zip" }), "c.zip");

    const response = await POST(
      new Request("http://localhost/api/upload", {
        method: "POST",
        body: form,
      }),
    );

    expect([207, 422]).toContain(response.status);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        success: false,
        uploaded: expect.any(Array),
        failed: expect.any(Array),
      }),
    );
  });

  it("bounds unexpected storage errors in batch responses", async () => {
    const storageKey = "private/teachers/teacher-1/materials/c.zip";
    uploadMock
      .mockRejectedValueOnce(new Error("backend-secret: bucket unavailable"))
      .mockResolvedValueOnce(storageKey);
    getURLMock.mockReturnValueOnce(storageUrlForKey(storageKey));
    const form = new FormData();
    form.append("purpose", "course-material");
    form.append("files", new File(["a"], "a.pdf", { type: "application/pdf" }), "a.pdf");
    form.append("files", new File(["c"], "c.zip", { type: "application/zip" }), "c.zip");

    const response = await POST(requestFromForm(form));
    const payload = await response.json();

    expect(response.status).toBe(207);
    expect(payload.failed).toEqual([{ name: "a.pdf", error: "Upload failed" }]);
    expect(JSON.stringify(payload)).not.toContain("backend-secret");
  });

  it("should keep storage integrity under concurrent upload requests for the same file", async () => {
    const storageKeys = [1, 2, 3].map(
      (index) =>
        `private/teachers/teacher-1/materials/00000000-0000-4000-8000-00000000000${index}-same.pdf`,
    );
    uploadMock
      .mockResolvedValueOnce(storageKeys[0])
      .mockResolvedValueOnce(storageKeys[1])
      .mockResolvedValueOnce(storageKeys[2]);
    getURLMock
      .mockReturnValueOnce(storageUrlForKey(storageKeys[0]))
      .mockReturnValueOnce(storageUrlForKey(storageKeys[1]))
      .mockReturnValueOnce(storageUrlForKey(storageKeys[2]));

    const makeRequest = () => {
      const form = new FormData();
      form.append("purpose", "course-material");
      form.append(
        "file",
        new File(["same-content"], "same.pdf", { type: "application/pdf" }),
        "same.pdf",
      );

      return POST(
        new Request("http://localhost/api/upload", {
          method: "POST",
          body: form,
        }),
      );
    };

    const responses = await Promise.all([makeRequest(), makeRequest(), makeRequest()]);
    const payloads = await Promise.all(responses.map((r) => r.json()));

    expect(responses.every((r) => r.status === 201)).toBe(true);
    const ids = payloads.map((p) => p.fileId);
    expect(new Set(ids).size).toBe(3);
  });

  it("should sanitize dangerous filenames and keep final path within uploads root", async () => {
    const storageKey =
      "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000001-safe-secret.txt";
    uploadMock.mockResolvedValueOnce(storageKey);
    getURLMock.mockReturnValueOnce(storageUrlForKey(storageKey));

    const form = new FormData();
    form.append("purpose", "course-material");
    form.append(
      "file",
      new File(["x"], "..\\..\\secret.txt", { type: "text/plain" }),
      "..\\..\\secret.txt",
    );

    const response = await POST(
      new Request("http://localhost/api/upload", {
        method: "POST",
        body: form,
      }),
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.fileId).not.toMatch(/\.\./);
    expect(payload.url).toMatch(/^\/api\/files\//i);
  });

  it("returns upload metadata using storageKey/publicUrl rather than trusting path traversal filename", async () => {
    const storageKey =
      "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000001-safe-secret.pdf";
    const publicUrl = storageUrlForKey(storageKey);
    uploadMock.mockResolvedValueOnce(storageKey);
    getURLMock.mockReturnValueOnce(publicUrl);

    const form = new FormData();
    form.append("purpose", "course-material");
    form.append(
      "file",
      new File(["pdf"], "..\\..\\secret.pdf", { type: "application/pdf" }),
      "..\\..\\secret.pdf",
    );

    const response = await POST(
      new Request("http://localhost/api/upload", {
        method: "POST",
        body: form,
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        success: true,
        storageKey,
        publicUrl,
        filename: "secret.pdf",
        mimeType: "application/pdf",
        size: expect.any(Number),
      }),
    );
  });

  it.each([
    "ENOSPC: no space left on C:\\private\\uploads",
    "filename index failed at /srv/private/uploads/a.pdf",
    "content type table size overflow at D:\\storage\\private",
  ])(
    "masks backend failures even when their message collides with validation keywords: %s",
    async (backendMessage) => {
      uploadMock.mockRejectedValueOnce(new Error(backendMessage));

      const form = new FormData();
      form.append("purpose", "course-material");
      form.append("file", new File(["x"], "ok.pdf", { type: "application/pdf" }), "ok.pdf");

      const response = await POST(
        new Request("http://localhost/api/upload", {
          method: "POST",
          body: form,
        }),
      );

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        success: false,
        error: "Upload failed",
      });
    },
  );

  it("returns 500 on unexpected storage failure", async () => {
    uploadMock.mockRejectedValueOnce(new Error("unexpected failure"));

    const form = new FormData();
    form.append("purpose", "course-material");
    form.append("file", new File(["x"], "ok.pdf", { type: "application/pdf" }), "ok.pdf");

    const response = await POST(
      new Request("http://localhost/api/upload", {
        method: "POST",
        body: form,
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: expect.stringMatching(/upload failed/i),
    });
  });
});
