import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const submitCourseMaterialActionMock = vi.hoisted(() => vi.fn());
const updateCourseMaterialActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/portal/teacher/actions/material-actions", () => ({
  submitCourseMaterialAction: submitCourseMaterialActionMock,
  updateCourseMaterialAction: updateCourseMaterialActionMock,
}));

type MaterialFormProps = {
  cancelHref?: string;
  initialValues?: Record<string, unknown>;
  lessons: Array<{ id: string; title: string }>;
  materialId?: string;
  mode: "create" | "edit";
};

async function loadMaterialForm() {
  const specifier = "@/app/portal/teacher/components/MaterialForm";
  const module = (await import(/* @vite-ignore */ specifier)) as {
    MaterialForm: ComponentType<MaterialFormProps>;
  };
  return module.MaterialForm;
}

const lessons = [
  { id: "lesson-1", title: "Algebra Group A lesson" },
  { id: "lesson-2", title: "Geometry lesson" },
];

describe("MaterialForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("supports create mode with required fields and cancel/back link", async () => {
    const MaterialForm = await loadMaterialForm();
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

  it("supports edit mode with initial values", async () => {
    const MaterialForm = await loadMaterialForm();
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
    const MaterialForm = await loadMaterialForm();
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
    const MaterialForm = await loadMaterialForm();
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

  it.each(["https://cdn.school/material.pdf", "/uploads/teacher/material.pdf"])(
    "submits safe file URL %s",
    async (fileUrl) => {
      submitCourseMaterialActionMock.mockResolvedValue({
        success: true,
        data: { id: "material-1" },
      });

      const MaterialForm = await loadMaterialForm();
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
    },
  );

  it("calls updateCourseMaterialAction in edit mode and shows server errors", async () => {
    updateCourseMaterialActionMock.mockResolvedValue({
      success: false,
      error: { fileUrl: ["Invalid file URL"] },
    });

    const MaterialForm = await loadMaterialForm();
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

  it("renders a file input and shows selected filename and size", async () => {
    const MaterialForm = await loadMaterialForm();
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
  ])("accepts supported upload file type: %s", async (_label, filename, mimeType) => {
    const MaterialForm = await loadMaterialForm();
    render(<MaterialForm mode="create" lessons={lessons} />);

    const fileInput = screen.getByLabelText(/upload file|file upload|choose file/i);
    fireEvent.change(fileInput, {
      target: { files: [new File(["content"], filename, { type: mimeType })] },
    });

    expect(screen.queryByText(/unsupported|not allowed|invalid file type/i)).toBeNull();
    expect(screen.getByText(filename)).toBeDefined();
  });

  it("rejects empty, oversized, and unsupported uploads with visible errors", async () => {
    const MaterialForm = await loadMaterialForm();
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
      target: { files: [new File(["html"], "x.html", { type: "text/html" })] },
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
            storageKey: "uploads/teacher/worksheet.pdf",
            publicUrl: "/uploads/teacher/worksheet.pdf",
            filename: "worksheet.pdf",
            mimeType: "application/pdf",
            size: 5,
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const MaterialForm = await loadMaterialForm();
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
  });

  it("stores attachment metadata after successful upload and sends it on create submit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            storageKey: "uploads/teacher/worksheet.pdf",
            publicUrl: "/uploads/teacher/worksheet.pdf",
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

    const MaterialForm = await loadMaterialForm();
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
        fileUrl: "/uploads/teacher/worksheet.pdf",
        attachment: {
          filename: "worksheet.pdf",
          storageKey: "uploads/teacher/worksheet.pdf",
          mimeType: "application/pdf",
          size: 5,
        },
      }),
    );
  });

  it("edit mode can keep an existing file unchanged or replace it with new attachment metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            storageKey: "uploads/teacher/replacement.pdf",
            publicUrl: "/uploads/teacher/replacement.pdf",
            filename: "replacement.pdf",
            mimeType: "application/pdf",
            size: 11,
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    updateCourseMaterialActionMock.mockResolvedValue({ success: true, data: { id: "material-1" } });

    const MaterialForm = await loadMaterialForm();
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
        fileUrl: "/uploads/teacher/replacement.pdf",
        attachment: expect.objectContaining({
          storageKey: "uploads/teacher/replacement.pdf",
        }),
      }),
    );
  });

  it("keeps the existing file visible when replacement upload fails and still supports external fileUrl fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Upload failed")));

    const MaterialForm = await loadMaterialForm();
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
