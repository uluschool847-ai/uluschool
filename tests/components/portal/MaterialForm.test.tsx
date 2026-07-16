import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const submitCourseMaterialActionMock = vi.hoisted(() => vi.fn());
const updateCourseMaterialActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/portal/teacher/actions/material-actions", () => ({
  submitCourseMaterialAction: submitCourseMaterialActionMock,
  updateCourseMaterialAction: updateCourseMaterialActionMock,
}));

import { MaterialForm } from "@/app/portal/teacher/components/MaterialForm";
import { storageUrlForKey } from "@/lib/storage/storage-url";

const lessons = [
  { id: "lesson-1", title: "Algebra Group A lesson" },
  { id: "lesson-2", title: "Geometry lesson" },
];

const uploadedStorageKey =
  "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000001-worksheet.pdf";
const uploadedPublicUrl = storageUrlForKey(uploadedStorageKey);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function successfulUploadResponse(storageKey: string, filename: string) {
  return new Response(
    JSON.stringify({
      success: true,
      storageKey,
      publicUrl: storageUrlForKey(storageKey),
      filename,
      mimeType: "application/pdf",
      size: 5,
    }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}

describe("MaterialForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("supports create mode with required fields and cancel/back link", () => {
    render(<MaterialForm mode="create" lessons={lessons} cancelHref="/portal/teacher/materials" />);

    expect(screen.getByLabelText(/^title$/i)).toBeDefined();
    expect(screen.getByLabelText(/description/i)).toBeDefined();
    expect(screen.getByLabelText(/file url/i)).toBeDefined();
    expect(screen.getByLabelText(/lesson|scheduled class/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /create material/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /cancel|back/i })).toHaveAttribute(
      "href",
      "/portal/teacher/materials",
    );
    expect(document.querySelector('input[name="teacherId"]')).toBeNull();
  });

  it("supports edit mode with initial values", () => {
    render(
      <MaterialForm
        mode="edit"
        materialId="material-1"
        lessons={lessons}
        initialValues={{
          description: "Initial description",
          fileUrl: "https://cdn.school/initial.pdf",
          scheduledClassId: "lesson-2",
          title: "Initial title",
        }}
      />,
    );

    expect(screen.getByDisplayValue("Initial title")).toBeDefined();
    expect(screen.getByDisplayValue("https://cdn.school/initial.pdf")).toBeDefined();
    expect(screen.getByLabelText(/lesson|scheduled class/i)).toHaveProperty("value", "lesson-2");
    expect(screen.getByRole("button", { name: /save changes|update/i })).toBeDefined();
  });

  it("validates title, scheduledClassId, and fileUrl before submit", async () => {
    render(<MaterialForm mode="create" lessons={lessons} />);

    fireEvent.click(screen.getByRole("button", { name: /create material|submit/i }));

    expect(await screen.findByText(/title is required/i)).toBeDefined();
    expect(await screen.findByText(/lesson is required|scheduled class/i)).toBeDefined();
    expect(await screen.findByText(/file url is required/i)).toBeDefined();
    expect(submitCourseMaterialActionMock).not.toHaveBeenCalled();
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdA==",
    "file:///etc/passwd",
    "http://example.com/material.pdf",
  ])("shows invalid file URL errors for unsafe URL %s", async (fileUrl) => {
    render(<MaterialForm mode="create" lessons={lessons} />);

    fireEvent.change(screen.getByLabelText(/^title$/i), { target: { value: "Material" } });
    fireEvent.change(screen.getByLabelText(/lesson|scheduled class/i), {
      target: { value: "lesson-1" },
    });
    fireEvent.change(screen.getByLabelText(/file url/i), { target: { value: fileUrl } });
    fireEvent.click(screen.getByRole("button", { name: /create material|submit/i }));

    expect(await screen.findByText(/safe https|internal upload|invalid file url/i)).toBeDefined();
    expect(submitCourseMaterialActionMock).not.toHaveBeenCalled();
  });

  it.each(["https://cdn.school/material.pdf"])("submits safe file URL %s", async (fileUrl) => {
    submitCourseMaterialActionMock.mockResolvedValue({
      success: true,
      data: { id: "material-1" },
    });

    render(<MaterialForm mode="create" lessons={lessons} />);

    fireEvent.change(screen.getByLabelText(/^title$/i), { target: { value: "Material" } });
    fireEvent.change(screen.getByLabelText(/lesson|scheduled class/i), {
      target: { value: "lesson-1" },
    });
    fireEvent.change(screen.getByLabelText(/file url/i), { target: { value: fileUrl } });
    fireEvent.click(screen.getByRole("button", { name: /create material|submit/i }));

    expect(submitCourseMaterialActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fileUrl,
        scheduledClassId: "lesson-1",
        title: "Material",
      }),
    );
  });

  it("rejects a manually entered internal application URL without upload metadata", async () => {
    render(<MaterialForm mode="create" lessons={lessons} />);

    fireEvent.change(screen.getByLabelText(/^title$/i), { target: { value: "Material" } });
    fireEvent.change(screen.getByLabelText(/lesson|scheduled class/i), {
      target: { value: "lesson-1" },
    });
    fireEvent.change(screen.getByLabelText(/file url/i), {
      target: { value: uploadedPublicUrl },
    });
    fireEvent.click(screen.getByRole("button", { name: /create material|submit/i }));

    expect(await screen.findByText(/safe https|internal upload|invalid file url/i)).toBeDefined();
    expect(submitCourseMaterialActionMock).not.toHaveBeenCalled();
  });

  it("rejects an untrusted legacy upload URL in create mode", async () => {
    render(<MaterialForm mode="create" lessons={lessons} />);

    fireEvent.change(screen.getByLabelText(/^title$/i), { target: { value: "Material" } });
    fireEvent.change(screen.getByLabelText(/lesson|scheduled class/i), {
      target: { value: "lesson-1" },
    });
    fireEvent.change(screen.getByLabelText(/file url/i), {
      target: { value: "/uploads/teacher/material.pdf" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create material|submit/i }));

    expect(await screen.findByText(/safe https|internal upload|invalid file url/i)).toBeDefined();
    expect(submitCourseMaterialActionMock).not.toHaveBeenCalled();
  });

  it("calls updateCourseMaterialAction in edit mode and shows server errors", async () => {
    updateCourseMaterialActionMock.mockResolvedValue({
      success: false,
      error: { fileUrl: ["Invalid file URL"] },
    });

    render(
      <MaterialForm
        mode="edit"
        materialId="material-1"
        lessons={lessons}
        initialValues={{
          fileUrl: "https://cdn.school/material.pdf",
          scheduledClassId: "lesson-1",
          title: "Material",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /save changes|update/i }));

    expect(updateCourseMaterialActionMock).toHaveBeenCalledWith(
      "material-1",
      expect.objectContaining({ title: "Material" }),
    );
    expect(await screen.findByText(/invalid file url/i)).toBeDefined();
  });

  it("renders a file input and shows selected filename and size", () => {
    render(<MaterialForm mode="create" lessons={lessons} />);

    const fileInput = screen.getByLabelText(/upload file|file upload|choose file/i);
    const file = new File(["hello"], "worksheet.pdf", { type: "application/pdf" });

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(screen.getByText("worksheet.pdf")).toBeDefined();
    expect(screen.getByText(/5\s*(b|bytes)/i)).toBeDefined();
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
    ["ZIP", "archive.zip", "application/zip"],
    ["image", "diagram.png", "image/png"],
    ["text", "notes.txt", "text/plain"],
  ])("accepts supported upload file type: %s", async (_label, filename, mimeType) => {
    render(<MaterialForm mode="create" lessons={lessons} />);

    const fileInput = screen.getByLabelText(/upload file|file upload|choose file/i);
    fireEvent.change(fileInput, {
      target: { files: [new File(["content"], filename, { type: mimeType })] },
    });

    expect(screen.queryByText(/unsupported|not allowed|invalid file type/i)).toBeNull();
    expect(screen.getByText(filename)).toBeDefined();
  });

  it("rejects empty, oversized, and unsupported uploads with visible errors", async () => {
    render(<MaterialForm mode="create" lessons={lessons} />);
    const fileInput = screen.getByLabelText(/upload file|file upload|choose file/i);

    fireEvent.change(fileInput, {
      target: { files: [new File([new Uint8Array(0)], "empty.pdf", { type: "application/pdf" })] },
    });
    expect(await screen.findByText(/empty|zero/i)).toBeDefined();

    fireEvent.change(fileInput, {
      target: {
        files: [
          new File([new Uint8Array(6 * 1024 * 1024)], "large.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });
    expect(await screen.findByText(/5mb|too large|size/i)).toBeDefined();

    fireEvent.change(fileInput, {
      target: { files: [new File(["<svg />"], "x.svg", { type: "image/svg+xml" })] },
    });
    expect(await screen.findByText(/unsupported|not allowed|invalid file type/i)).toBeDefined();
  });

  it("shows upload loading, error, and retry state for explicit upload", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("Upload failed"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            storageKey: uploadedStorageKey,
            publicUrl: uploadedPublicUrl,
            filename: "worksheet.pdf",
            mimeType: "application/pdf",
            size: 5,
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<MaterialForm mode="create" lessons={lessons} />);

    fireEvent.change(screen.getByLabelText(/upload file|file upload|choose file/i), {
      target: { files: [new File(["hello"], "worksheet.pdf", { type: "application/pdf" })] },
    });

    fireEvent.click(screen.getByRole("button", { name: /upload/i }));
    expect(screen.getByRole("button", { name: /uploading|retry upload/i })).toBeDefined();
    expect(await screen.findByText(/upload failed/i)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /retry upload|upload/i }));
    expect(await screen.findByText(/uploaded|upload complete/i)).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/upload",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
    );
    const requestOptions = fetchMock.mock.calls[1][1] as RequestInit;
    expect(requestOptions.headers).toBeUndefined();
    expect((requestOptions.body as FormData).get("purpose")).toBe("course-material");
  });

  it("stores attachment metadata after successful upload and sends it on create submit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            storageKey: uploadedStorageKey,
            publicUrl: uploadedPublicUrl,
            filename: "worksheet.pdf",
            mimeType: "application/pdf",
            size: 5,
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    submitCourseMaterialActionMock.mockResolvedValue({
      success: true,
      data: { id: "material-1" },
    });

    render(<MaterialForm mode="create" lessons={lessons} />);

    fireEvent.change(screen.getByLabelText(/^title$/i), { target: { value: "Material" } });
    fireEvent.change(screen.getByLabelText(/lesson|scheduled class/i), {
      target: { value: "lesson-1" },
    });
    fireEvent.change(screen.getByLabelText(/upload file|file upload|choose file/i), {
      target: { files: [new File(["hello"], "worksheet.pdf", { type: "application/pdf" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    expect(await screen.findByText(/uploaded|upload complete/i)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /create material/i }));

    expect(submitCourseMaterialActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fileUrl: uploadedPublicUrl,
        attachment: {
          filename: "worksheet.pdf",
          storageKey: uploadedStorageKey,
          mimeType: "application/pdf",
          size: 5,
        },
      }),
    );
  });

  it("releases a superseded pending upload before selecting a replacement", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          storageKey: uploadedStorageKey,
          publicUrl: uploadedPublicUrl,
          filename: "worksheet.pdf",
          mimeType: "application/pdf",
          size: 5,
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<MaterialForm mode="create" lessons={lessons} />);
    const fileInput = screen.getByLabelText(/upload file|file upload|choose file/i);
    fireEvent.change(fileInput, {
      target: { files: [new File(["first"], "worksheet.pdf", { type: "application/pdf" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));
    expect(await screen.findByText(/uploaded|upload complete/i)).toBeDefined();

    fireEvent.change(fileInput, {
      target: { files: [new File(["second"], "replacement.pdf", { type: "application/pdf" })] },
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/upload",
        expect.objectContaining({
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ storageKey: uploadedStorageKey }),
          keepalive: true,
        }),
      );
    });
  });

  it.each([
    ["A then B", ["A", "B"]],
    ["B then A", ["B", "A"]],
  ] as const)(
    "releases every stale successful upload when deferred requests complete %s",
    async (_label, completionOrder) => {
      const firstStorageKey =
        "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000010-first.pdf";
      const secondStorageKey =
        "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000011-second.pdf";
      const firstRequest = deferred<Response>();
      const secondRequest = deferred<Response>();
      const posts = [firstRequest.promise, secondRequest.promise];
      let postIndex = 0;
      const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => {
        if (options?.method === "POST") return posts[postIndex++];
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      });
      vi.stubGlobal("fetch", fetchMock);

      render(
        <StrictMode>
          <MaterialForm mode="create" lessons={lessons} />
        </StrictMode>,
      );
      const fileInput = screen.getByLabelText(/upload file|file upload|choose file/i);
      fireEvent.change(fileInput, {
        target: { files: [new File(["first"], "first.pdf", { type: "application/pdf" })] },
      });
      fireEvent.click(screen.getByRole("button", { name: /^upload$/i }));
      fireEvent.change(fileInput, {
        target: { files: [new File(["second"], "second.pdf", { type: "application/pdf" })] },
      });
      fireEvent.click(screen.getByRole("button", { name: /^upload$/i }));

      for (const request of completionOrder) {
        await act(async () => {
          if (request === "A") {
            firstRequest.resolve(successfulUploadResponse(firstStorageKey, "first.pdf"));
          } else {
            secondRequest.resolve(successfulUploadResponse(secondStorageKey, "second.pdf"));
          }
          await Promise.resolve();
        });
      }

      expect(await screen.findByText(/upload complete: second\.pdf/i)).toBeDefined();
      await waitFor(() => {
        const deletedKeys = fetchMock.mock.calls
          .filter(([, options]) => options?.method === "DELETE")
          .map(([, options]) => JSON.parse(String(options?.body)).storageKey);
        expect(deletedKeys).toEqual([firstStorageKey]);
        expect(deletedKeys).not.toContain(secondStorageKey);
      });
    },
  );

  it("prevents Cancel navigation while an upload POST is unresolved and later releases its key", async () => {
    const request = deferred<Response>();
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === "POST") return request.promise;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <StrictMode>
        <MaterialForm mode="create" lessons={lessons} />
      </StrictMode>,
    );
    fireEvent.change(screen.getByLabelText(/upload file|file upload|choose file/i), {
      target: { files: [new File(["first"], "first.pdf", { type: "application/pdf" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /^upload$/i }));

    const cancel = screen.getByRole("link", { name: /cancel/i });
    expect(cancel).toHaveAttribute("aria-disabled", "true");
    expect(fireEvent.click(cancel)).toBe(false);
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "DELETE")).toHaveLength(
      0,
    );

    await act(async () => {
      request.resolve(successfulUploadResponse(uploadedStorageKey, "first.pdf"));
      await Promise.resolve();
    });
    expect(await screen.findByText(/upload complete: first\.pdf/i)).toBeDefined();
    cancel.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(cancel);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/upload",
        expect.objectContaining({
          method: "DELETE",
          body: JSON.stringify({ storageKey: uploadedStorageKey }),
        }),
      );
    });
  });

  it("releases a successful upload that completes after a StrictMode unmount", async () => {
    const request = deferred<Response>();
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === "POST") return request.promise;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(
      <StrictMode>
        <MaterialForm mode="create" lessons={lessons} />
      </StrictMode>,
    );
    fireEvent.change(screen.getByLabelText(/upload file|file upload|choose file/i), {
      target: { files: [new File(["first"], "first.pdf", { type: "application/pdf" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /^upload$/i }));
    unmount();

    await act(async () => {
      request.resolve(successfulUploadResponse(uploadedStorageKey, "first.pdf"));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/upload",
        expect.objectContaining({
          method: "DELETE",
          body: JSON.stringify({ storageKey: uploadedStorageKey }),
        }),
      );
    });
  });

  it("submits an opaque private application URL returned by the upload route", async () => {
    const storageKey = uploadedStorageKey;
    const publicUrl = uploadedPublicUrl;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            storageKey,
            publicUrl,
            filename: "worksheet.pdf",
            mimeType: "application/pdf",
            size: 5,
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    submitCourseMaterialActionMock.mockResolvedValue({
      success: true,
      data: { id: "material-1" },
    });

    render(<MaterialForm mode="create" lessons={lessons} />);
    fireEvent.change(screen.getByLabelText(/^title$/i), { target: { value: "Material" } });
    fireEvent.change(screen.getByLabelText(/lesson|scheduled class/i), {
      target: { value: "lesson-1" },
    });
    fireEvent.change(screen.getByLabelText(/upload file|file upload|choose file/i), {
      target: { files: [new File(["hello"], "worksheet.pdf", { type: "application/pdf" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));
    expect(await screen.findByText(/uploaded|upload complete/i)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /create material/i }));

    expect(submitCourseMaterialActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fileUrl: publicUrl,
        attachment: expect.objectContaining({ storageKey }),
      }),
    );
  });

  it("keeps submitted attachment state immutable while the action is unresolved", async () => {
    const submit = deferred<{ success: true; data: { id: string } }>();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(successfulUploadResponse(uploadedStorageKey, "file.pdf")),
    );
    submitCourseMaterialActionMock.mockReturnValueOnce(submit.promise);

    render(<MaterialForm mode="create" lessons={lessons} />);
    fireEvent.change(screen.getByLabelText(/^title$/i), { target: { value: "Material" } });
    fireEvent.change(screen.getByLabelText(/lesson|scheduled class/i), {
      target: { value: "lesson-1" },
    });
    fireEvent.change(screen.getByLabelText(/upload file|file upload|choose file/i), {
      target: { files: [new File(["file"], "file.pdf", { type: "application/pdf" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /^upload$/i }));
    expect(await screen.findByText(/upload complete/i)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /create material/i }));
    const fileUrl = screen.getByLabelText(/file url/i) as HTMLInputElement;
    const fileInput = screen.getByLabelText(
      /upload file|file upload|choose file/i,
    ) as HTMLInputElement;
    expect(fileUrl).toHaveProperty("disabled", true);
    expect(fileInput).toHaveProperty("disabled", true);
    fireEvent.change(fileUrl, { target: { value: "https://cdn.example.com/replaced.pdf" } });
    fireEvent.change(fileInput, {
      target: { files: [new File(["other"], "other.pdf", { type: "application/pdf" })] },
    });

    expect(fileUrl.value).toBe(uploadedPublicUrl);
    expect(screen.getByText("file.pdf")).toBeDefined();
    await act(async () => {
      submit.resolve({ success: true, data: { id: "material-1" } });
      await Promise.resolve();
    });
  });

  it("edit mode can keep an existing file unchanged or replace it with new attachment metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            storageKey: uploadedStorageKey,
            publicUrl: uploadedPublicUrl,
            filename: "replacement.pdf",
            mimeType: "application/pdf",
            size: 11,
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    updateCourseMaterialActionMock.mockResolvedValue({ success: true, data: { id: "material-1" } });

    const { unmount } = render(
      <MaterialForm
        mode="edit"
        materialId="material-1"
        lessons={lessons}
        initialValues={{
          fileUrl: "/uploads/teacher/existing.pdf",
          scheduledClassId: "lesson-1",
          title: "Existing material",
        }}
      />,
    );

    expect(screen.getByText(/existing file|current file/i)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(updateCourseMaterialActionMock).toHaveBeenCalledWith(
      "material-1",
      expect.not.objectContaining({ attachment: expect.anything() }),
    );

    unmount();
    render(
      <MaterialForm
        mode="edit"
        materialId="material-1"
        lessons={lessons}
        initialValues={{
          fileUrl: "/uploads/teacher/existing.pdf",
          scheduledClassId: "lesson-1",
          title: "Existing material",
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText(/upload file|file upload|choose file/i), {
      target: {
        files: [new File(["replacement"], "replacement.pdf", { type: "application/pdf" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));
    expect(await screen.findByText(/uploaded|upload complete/i)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(updateCourseMaterialActionMock).toHaveBeenLastCalledWith(
      "material-1",
      expect.objectContaining({
        fileUrl: uploadedPublicUrl,
        attachment: expect.objectContaining({
          storageKey: uploadedStorageKey,
        }),
      }),
    );
  });

  it("rejects changing a trusted persisted legacy URL to a different legacy URL", async () => {
    render(
      <MaterialForm
        mode="edit"
        materialId="material-1"
        lessons={lessons}
        initialValues={{
          fileUrl: "/uploads/teacher/existing.pdf",
          scheduledClassId: "lesson-1",
          title: "Existing material",
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText(/file url/i), {
      target: { value: "/uploads/teacher/foreign.pdf" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText(/safe https|internal upload|invalid file url/i)).toBeDefined();
    expect(updateCourseMaterialActionMock).not.toHaveBeenCalled();
  });

  it("keeps the existing file visible when replacement upload fails and still supports external fileUrl fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Upload failed")));

    render(
      <MaterialForm
        mode="edit"
        materialId="material-1"
        lessons={lessons}
        initialValues={{
          fileUrl: "https://cdn.school/existing.pdf",
          scheduledClassId: "lesson-1",
          title: "Existing material",
        }}
      />,
    );

    expect(screen.getByDisplayValue("https://cdn.school/existing.pdf")).toBeDefined();
    fireEvent.change(screen.getByLabelText(/upload file|file upload|choose file/i), {
      target: { files: [new File(["new"], "new.pdf", { type: "application/pdf" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    expect(await screen.findByText(/upload failed/i)).toBeDefined();
    expect(screen.getByDisplayValue("https://cdn.school/existing.pdf")).toBeDefined();
  });
});
