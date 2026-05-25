import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deleteCourseMaterialActionMock = vi.hoisted(() => vi.fn());
const unlinkAttachmentActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/portal/teacher/actions/material-actions", () => ({
  deleteCourseMaterialAction: deleteCourseMaterialActionMock,
  unlinkAttachmentAction: unlinkAttachmentActionMock,
}));

type MaterialListProps = {
  materials: Array<Record<string, unknown>>;
};

async function loadMaterialList() {
  const specifier = "@/app/portal/teacher/components/MaterialList";
  const module = (await import(/* @vite-ignore */ specifier)) as {
    MaterialList: ComponentType<MaterialListProps>;
  };
  return module.MaterialList;
}

function material(overrides: Record<string, unknown> = {}) {
  return {
    id: "material-1",
    title: "Algebra worksheet",
    description: "Practice set",
    fileUrl: "https://cdn.school/materials/algebra.pdf",
    scheduledClassId: "lesson-1",
    className: "Algebra Group A",
    lessonTitle: "Algebra lesson",
    createdAt: "2026-06-01T09:00:00.000Z",
    updatedAt: "2026-06-02T10:00:00.000Z",
    editHref: "/portal/teacher/materials/material-1/edit",
    attachments: [],
    ...overrides,
  };
}

describe("MaterialList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders material rows with safe file link, edit link, and delete action", async () => {
    const MaterialList = await loadMaterialList();
    render(<MaterialList materials={[material()]} />);

    expect(screen.getByText(/algebra worksheet/i)).toBeDefined();
    expect(screen.getByText(/practice set/i)).toBeDefined();
    expect(screen.getByText(/algebra group a/i)).toBeDefined();
    expect(screen.getByText(/algebra lesson/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /view file/i })).toHaveAttribute(
      "href",
      "https://cdn.school/materials/algebra.pdf",
    );
    expect(screen.getByRole("link", { name: /edit/i })).toHaveAttribute(
      "href",
      "/portal/teacher/materials/material-1/edit",
    );
    expect(screen.getByRole("button", { name: /^delete$/i })).toBeDefined();
  });

  it("does not render unsafe file URL as an active link", async () => {
    const MaterialList = await loadMaterialList();
    render(<MaterialList materials={[material({ fileUrl: "javascript:alert(1)" })]} />);

    expect(screen.queryByRole("link", { name: /view file/i })).toBeNull();
    expect(screen.getByText(/invalid file link|file unavailable/i)).toBeDefined();
  });

  it("uses delete confirmation and loading state", async () => {
    deleteCourseMaterialActionMock.mockReturnValue(new Promise(() => undefined));

    const MaterialList = await loadMaterialList();
    render(<MaterialList materials={[material()]} />);

    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(screen.getByText(/delete this material/i)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /confirm delete/i }));

    expect(deleteCourseMaterialActionMock).toHaveBeenCalledWith("material-1");
    expect(screen.getByRole("button", { name: /deleting/i })).toHaveAttribute("disabled");
  });

  it("shows delete success, removes deleted item, and shows errors", async () => {
    deleteCourseMaterialActionMock.mockResolvedValueOnce({
      success: true,
      message: "Material deleted",
    });

    const MaterialList = await loadMaterialList();
    const { rerender } = render(<MaterialList materials={[material()]} />);

    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm delete/i }));

    expect(await screen.findByText(/material deleted/i)).toBeDefined();
    await waitFor(() => expect(screen.queryByText(/algebra worksheet/i)).toBeNull());

    deleteCourseMaterialActionMock.mockResolvedValueOnce({
      success: false,
      error: "Delete failed",
    });
    rerender(
      <MaterialList materials={[material({ id: "material-2", title: "Geometry slides" })]} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm delete/i }));

    expect(await screen.findByText(/delete failed/i)).toBeDefined();
  });

  it("renders empty state when there are no materials", async () => {
    const MaterialList = await loadMaterialList();
    render(<MaterialList materials={[]} />);

    expect(screen.getByText(/no materials/i)).toBeDefined();
  });

  it("renders material attachment filename and safe attachment link", async () => {
    const MaterialList = await loadMaterialList();
    render(
      <MaterialList
        materials={[
          material({
            fileUrl: null,
            attachments: [
              {
                id: "attachment-1",
                filename: "worksheet.pdf",
                storageKey: "uploads/teacher/worksheet.pdf",
                publicUrl: "/uploads/teacher/worksheet.pdf",
              },
            ],
          }),
        ]}
      />,
    );

    expect(screen.getByText("worksheet.pdf")).toBeDefined();
    expect(screen.getByRole("link", { name: /view worksheet\.pdf|view file/i })).toHaveAttribute(
      "href",
      "/uploads/teacher/worksheet.pdf",
    );
  });

  it("attachment unlink submits only materialId and attachmentId, not trusted storageKey", async () => {
    unlinkAttachmentActionMock.mockResolvedValueOnce({
      success: true,
      message: "Attachment deleted",
    });

    const MaterialList = await loadMaterialList();
    render(
      <MaterialList
        materials={[
          material({
            attachments: [
              {
                id: "attachment-1",
                filename: "worksheet.pdf",
                storageKey: "uploads/teacher/worksheet.pdf",
                publicUrl: "/uploads/teacher/worksheet.pdf",
              },
            ],
          }),
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /remove attachment|unlink file/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm remove|confirm unlink/i }));

    expect(unlinkAttachmentActionMock).toHaveBeenCalledWith({
      materialId: "material-1",
      attachmentId: "attachment-1",
    });
    expect(JSON.stringify(unlinkAttachmentActionMock.mock.calls[0])).not.toContain("storageKey");
    expect(await screen.findByText(/attachment deleted|file removed/i)).toBeDefined();
  });

  it("shows unlink loading and error feedback", async () => {
    unlinkAttachmentActionMock.mockResolvedValueOnce({
      success: false,
      error: "Unable to remove file",
    });

    const MaterialList = await loadMaterialList();
    render(
      <MaterialList
        materials={[
          material({
            attachments: [
              {
                id: "attachment-1",
                filename: "worksheet.pdf",
                storageKey: "uploads/teacher/worksheet.pdf",
                publicUrl: "/uploads/teacher/worksheet.pdf",
              },
            ],
          }),
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /remove attachment|unlink file/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm remove|confirm unlink/i }));

    expect(screen.getByRole("button", { name: /removing|unlinking/i })).toHaveAttribute("disabled");
    expect(await screen.findByText(/unable to remove file/i)).toBeDefined();
  });
});
