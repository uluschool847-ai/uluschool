import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updateEnquiryStatusActionMock = vi.hoisted(() => vi.fn());
const updateContactLeadStatusActionMock = vi.hoisted(() => vi.fn());
const addEnquiryNoteActionMock = vi.hoisted(() => vi.fn());
const addContactLeadNoteActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(admin)/admin/crm/actions", () => ({
  updateEnquiryStatusAction: updateEnquiryStatusActionMock,
  updateContactLeadStatusAction: updateContactLeadStatusActionMock,
  addEnquiryNoteAction: addEnquiryNoteActionMock,
  addContactLeadNoteAction: addContactLeadNoteActionMock,
}));

async function loadStatusForm() {
  const statusSpecifier = "@/components/admin/crm/StatusUpdateForm";
  const statusModule = (await import(/* @vite-ignore */ statusSpecifier)) as {
    StatusUpdateForm: React.ComponentType<{
      entityType: "enquiry" | "lead";
      entityId: string;
      currentStatus: string;
      statuses: string[];
    }>;
  };
  return statusModule.StatusUpdateForm;
}

async function loadNoteForm() {
  const noteSpecifier = "@/components/admin/crm/NoteAddForm";
  const noteModule = (await import(/* @vite-ignore */ noteSpecifier)) as {
    NoteAddForm: React.ComponentType<{
      entityType: "enquiry" | "lead";
      entityId: string;
    }>;
  };
  return noteModule.NoteAddForm;
}

describe("Admin CRM forms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("StatusUpdateForm calls enquiry status action when saving a new status", async () => {
    updateEnquiryStatusActionMock.mockResolvedValueOnce({ success: true });
    const StatusUpdateForm = await loadStatusForm();

    render(
      <StatusUpdateForm
        entityType="enquiry"
        entityId="enq-1"
        currentStatus="NEW"
        statuses={["NEW", "IN_PROGRESS", "CONVERTED", "REJECTED"]}
      />,
    );

    fireEvent.change(screen.getByLabelText(/status/i), {
      target: { value: "IN_PROGRESS" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save|update status/i }));

    await waitFor(() => {
      expect(updateEnquiryStatusActionMock).toHaveBeenCalledWith({
        id: "enq-1",
        status: "IN_PROGRESS",
      });
    });
  });

  it("StatusUpdateForm calls lead status action when entityType is lead", async () => {
    updateContactLeadStatusActionMock.mockResolvedValueOnce({ success: true });
    const StatusUpdateForm = await loadStatusForm();

    render(
      <StatusUpdateForm
        entityType="lead"
        entityId="lead-1"
        currentStatus="NEW"
        statuses={["NEW", "IN_PROGRESS", "CONVERTED", "REJECTED"]}
      />,
    );

    fireEvent.change(screen.getByLabelText(/status/i), {
      target: { value: "CONVERTED" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save|update status/i }));

    await waitFor(() => {
      expect(updateContactLeadStatusActionMock).toHaveBeenCalledWith({
        id: "lead-1",
        status: "CONVERTED",
      });
    });
  });

  it("StatusUpdateForm cancel restores the last saved status without calling actions", async () => {
    const StatusUpdateForm = await loadStatusForm();

    render(
      <StatusUpdateForm
        entityType="enquiry"
        entityId="enq-1"
        currentStatus="NEW"
        statuses={["NEW", "IN_PROGRESS", "CONVERTED"]}
      />,
    );

    fireEvent.change(screen.getByLabelText(/status/i), {
      target: { value: "CONVERTED" },
    });
    expect(screen.getByLabelText(/status/i)).toHaveProperty("value", "CONVERTED");

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.getByLabelText(/status/i)).toHaveProperty("value", "NEW");
    expect(updateEnquiryStatusActionMock).not.toHaveBeenCalled();
  });

  it("StatusUpdateForm shows a loading or optimistic state while saving", async () => {
    let resolveAction: (value: unknown) => void = () => {};
    updateEnquiryStatusActionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );
    const StatusUpdateForm = await loadStatusForm();

    render(
      <StatusUpdateForm
        entityType="enquiry"
        entityId="enq-1"
        currentStatus="NEW"
        statuses={["NEW", "IN_PROGRESS"]}
      />,
    );

    fireEvent.change(screen.getByLabelText(/status/i), {
      target: { value: "IN_PROGRESS" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save|update status/i }));

    expect(screen.getByText(/saving|updating|please wait/i)).toBeDefined();
    resolveAction({ success: true });
  });

  it("NoteAddForm prevents empty enquiry note submission", async () => {
    const NoteAddForm = await loadNoteForm();

    render(<NoteAddForm entityType="enquiry" entityId="enq-1" />);

    fireEvent.click(screen.getByRole("button", { name: /add note|save note|submit/i }));

    expect(
      await screen.findByText(/note is required|content is required|enter a note/i),
    ).toBeDefined();
    expect(addEnquiryNoteActionMock).not.toHaveBeenCalled();
  });

  it("NoteAddForm submits enquiry note and clears after success", async () => {
    addEnquiryNoteActionMock.mockResolvedValueOnce({
      success: true,
      data: { id: "note-1" },
    });
    const NoteAddForm = await loadNoteForm();

    render(<NoteAddForm entityType="enquiry" entityId="enq-1" />);

    const textarea = screen.getByLabelText(/note/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "Parent asked for a Monday callback." },
    });
    fireEvent.click(screen.getByRole("button", { name: /add note|save note|submit/i }));

    await waitFor(() => {
      expect(addEnquiryNoteActionMock).toHaveBeenCalledWith({
        id: "enq-1",
        content: "Parent asked for a Monday callback.",
      });
    });
    expect(textarea.value).toBe("");
  });

  it("NoteAddForm submits contact lead note and clears after success", async () => {
    addContactLeadNoteActionMock.mockResolvedValueOnce({
      success: true,
      data: { id: "note-2" },
    });
    const NoteAddForm = await loadNoteForm();

    render(<NoteAddForm entityType="lead" entityId="lead-1" />);

    const textarea = screen.getByLabelText(/note/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "Sent pricing document." },
    });
    fireEvent.click(screen.getByRole("button", { name: /add note|save note|submit/i }));

    await waitFor(() => {
      expect(addContactLeadNoteActionMock).toHaveBeenCalledWith({
        id: "lead-1",
        content: "Sent pricing document.",
      });
    });
    expect(textarea.value).toBe("");
  });

  it("NoteAddForm cancel clears note text and feedback without submitting", async () => {
    const NoteAddForm = await loadNoteForm();

    render(<NoteAddForm entityType="lead" entityId="lead-1" />);

    const textarea = screen.getByLabelText(/note/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "Draft note to cancel." },
    });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(textarea.value).toBe("");
    expect(addContactLeadNoteActionMock).not.toHaveBeenCalled();
  });
});
