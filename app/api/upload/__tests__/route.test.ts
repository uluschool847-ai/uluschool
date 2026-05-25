import { beforeEach, describe, expect, it, vi } from "vitest";

const uploadMock = vi.hoisted(() => vi.fn());
const getURLMock = vi.hoisted(() => vi.fn());
const deleteMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/storage", () => ({
  // RED phase: contract we want route to consume
  createStorageService: () => ({
    upload: uploadMock,
    getURL: getURLMock,
    delete: deleteMock,
  }),
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

describe("app/api/upload/route local-first upload integration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  it("returns 201 with local path for DEVELOPER role happy path", async () => {
    uploadMock.mockResolvedValueOnce("uploads/dev/1234.pdf");
    getURLMock.mockReturnValueOnce("/public/uploads/dev/1234.pdf");

    const { POST } = await import("@/app/api/upload/route");

    const form = new FormData();
    form.append(
      "file",
      new File(["hello"], "homework.pdf", { type: "application/pdf" }),
      "homework.pdf",
    );

    const response = await POST(
      new Request("http://localhost/api/upload", {
        method: "POST",
        headers: { "x-role": "DEVELOPER" },
        body: form,
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      success: true,
      fileId: "uploads/dev/1234.pdf",
      url: "/public/uploads/dev/1234.pdf",
    });
  });

  it("should reject uploads from roles outside allowed policy", async () => {
    const { POST } = await import("@/app/api/upload/route");

    const form = new FormData();
    form.append(
      "file",
      new File(["hello"], "homework.pdf", { type: "application/pdf" }),
      "homework.pdf",
    );

    const response = await POST(
      new Request("http://localhost/api/upload", {
        method: "POST",
        headers: { "x-role": "STUDENT" },
        body: form,
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      error: expect.stringMatching(/(forbidden|role|policy)/i),
    });
  });

  it("rejects request when file is missing", async () => {
    const { POST } = await import("@/app/api/upload/route");

    const form = new FormData();

    const response = await POST(
      new Request("http://localhost/api/upload", {
        method: "POST",
        headers: { "x-role": "DEVELOPER" },
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
    const { POST } = await import("@/app/api/upload/route");

    const response = await POST(
      new Request("http://localhost/api/upload", {
        method: "POST",
        headers: {
          "x-role": "DEVELOPER",
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

  it("rejects invalid MIME type", async () => {
    const { POST } = await import("@/app/api/upload/route");

    const form = new FormData();
    form.append("file", new File(["x"], "exploit.html", { type: "text/html" }), "exploit.html");

    const response = await POST(
      new Request("http://localhost/api/upload", {
        method: "POST",
        headers: { "x-role": "DEVELOPER" },
        body: form,
      }),
    );

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({
      success: false,
      error: expect.stringMatching(/(mime|type|allowed)/i),
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
    uploadMock.mockResolvedValueOnce(`uploads/teacher/${filename}`);
    getURLMock.mockReturnValueOnce(`/uploads/teacher/${filename}`);

    const { POST } = await import("@/app/api/upload/route");

    const form = new FormData();
    form.append("file", new File(["content"], filename, { type: mimeType }), filename);

    const response = await POST(
      new Request("http://localhost/api/upload", {
        method: "POST",
        headers: { "x-role": "TEACHER" },
        body: form,
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        success: true,
        storageKey: `uploads/teacher/${filename}`,
        publicUrl: `/uploads/teacher/${filename}`,
        filename,
        mimeType,
        size: expect.any(Number),
      }),
    );
  });

  it("rejects file over 5MB", async () => {
    const { POST } = await import("@/app/api/upload/route");

    const sixMb = new Uint8Array(6 * 1024 * 1024);
    const form = new FormData();
    form.append("file", new File([sixMb], "big.zip", { type: "application/zip" }), "big.zip");
    const req = {
      headers: new Headers({ "x-role": "DEVELOPER" }),
      formData: async () => form,
    } as unknown as Request;

    const response = await POST(req);

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      success: false,
      error: expect.stringMatching(/(5mb|too large|size)/i),
    });
  });

  it("should reject zero-byte files with 400", async () => {
    const { POST } = await import("@/app/api/upload/route");

    const form = new FormData();
    form.append(
      "file",
      new File([new Uint8Array(0)], "empty.pdf", { type: "application/pdf" }),
      "empty.pdf",
    );
    const req = {
      headers: new Headers({ "x-role": "DEVELOPER" }),
      formData: async () => form,
    } as unknown as Request;

    const response = await POST(req);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: expect.stringMatching(/(empty|zero|size)/i),
    });
  });

  it("should report partial failure in batch upload when one file is invalid", async () => {
    uploadMock
      .mockResolvedValueOnce("uploads/dev/a.pdf")
      .mockRejectedValueOnce(new Error("MIME type not allowed"))
      .mockResolvedValueOnce("uploads/dev/c.zip");
    getURLMock
      .mockReturnValueOnce("/public/uploads/dev/a.pdf")
      .mockReturnValueOnce("/public/uploads/dev/c.zip");

    const { POST } = await import("@/app/api/upload/route");

    const form = new FormData();
    form.append("files", new File(["a"], "a.pdf", { type: "application/pdf" }), "a.pdf");
    form.append("files", new File(["b"], "b.exe", { type: "application/x-msdownload" }), "b.exe");
    form.append("files", new File(["c"], "c.zip", { type: "application/zip" }), "c.zip");

    const response = await POST(
      new Request("http://localhost/api/upload", {
        method: "POST",
        headers: { "x-role": "DEVELOPER" },
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

  it("should keep storage integrity under concurrent upload requests for the same file", async () => {
    uploadMock
      .mockResolvedValueOnce("uploads/dev/same-1.pdf")
      .mockResolvedValueOnce("uploads/dev/same-2.pdf")
      .mockResolvedValueOnce("uploads/dev/same-3.pdf");
    getURLMock
      .mockReturnValueOnce("/public/uploads/dev/same-1.pdf")
      .mockReturnValueOnce("/public/uploads/dev/same-2.pdf")
      .mockReturnValueOnce("/public/uploads/dev/same-3.pdf");

    const { POST } = await import("@/app/api/upload/route");

    const makeRequest = () => {
      const form = new FormData();
      form.append(
        "file",
        new File(["same-content"], "same.pdf", { type: "application/pdf" }),
        "same.pdf",
      );

      return POST(
        new Request("http://localhost/api/upload", {
          method: "POST",
          headers: { "x-role": "DEVELOPER" },
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
    uploadMock.mockResolvedValueOnce("uploads/dev/safe-secret.txt");
    getURLMock.mockReturnValueOnce("/public/uploads/dev/safe-secret.txt");

    const { POST } = await import("@/app/api/upload/route");

    const form = new FormData();
    form.append(
      "file",
      new File(["x"], "..\\..\\secret.txt", { type: "text/plain" }),
      "..\\..\\secret.txt",
    );

    const response = await POST(
      new Request("http://localhost/api/upload", {
        method: "POST",
        headers: { "x-role": "DEVELOPER" },
        body: form,
      }),
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.fileId).not.toMatch(/\.\./);
    expect(payload.url).toMatch(/^\/(public\/)?uploads\//i);
  });

  it("returns upload metadata using storageKey/publicUrl rather than trusting path traversal filename", async () => {
    uploadMock.mockResolvedValueOnce("uploads/teacher/safe-secret.pdf");
    getURLMock.mockReturnValueOnce("/uploads/teacher/safe-secret.pdf");

    const { POST } = await import("@/app/api/upload/route");

    const form = new FormData();
    form.append(
      "file",
      new File(["pdf"], "..\\..\\secret.pdf", { type: "application/pdf" }),
      "..\\..\\secret.pdf",
    );

    const response = await POST(
      new Request("http://localhost/api/upload", {
        method: "POST",
        headers: { "x-role": "TEACHER" },
        body: form,
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        success: true,
        storageKey: "uploads/teacher/safe-secret.pdf",
        publicUrl: "/uploads/teacher/safe-secret.pdf",
        filename: "safe-secret.pdf",
        mimeType: "application/pdf",
        size: expect.any(Number),
      }),
    );
  });

  it("returns 507 when underlying storage reports disk full", async () => {
    uploadMock.mockRejectedValueOnce(new Error("ENOSPC: no space left on device"));

    const { POST } = await import("@/app/api/upload/route");

    const form = new FormData();
    form.append("file", new File(["x"], "ok.pdf", { type: "application/pdf" }), "ok.pdf");

    const response = await POST(
      new Request("http://localhost/api/upload", {
        method: "POST",
        headers: { "x-role": "DEVELOPER" },
        body: form,
      }),
    );

    expect(response.status).toBe(507);
    expect(await response.json()).toEqual({
      success: false,
      error: expect.stringMatching(/(space|disk|enospc)/i),
    });
  });

  it("returns 500 on unexpected storage failure", async () => {
    uploadMock.mockRejectedValueOnce(new Error("unexpected failure"));

    const { POST } = await import("@/app/api/upload/route");

    const form = new FormData();
    form.append("file", new File(["x"], "ok.pdf", { type: "application/pdf" }), "ok.pdf");

    const response = await POST(
      new Request("http://localhost/api/upload", {
        method: "POST",
        headers: { "x-role": "DEVELOPER" },
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
