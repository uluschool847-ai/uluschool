import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const addEnquiryNoteActionMock = vi.hoisted(() => vi.fn());
const updateEnquiryStatusActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(admin)/admin/crm/actions", () => ({
  addEnquiryNoteAction: addEnquiryNoteActionMock,
  addContactLeadNoteAction: vi.fn(),
  updateEnquiryStatusAction: updateEnquiryStatusActionMock,
  updateContactLeadStatusAction: vi.fn(),
}));

import { NoteAddForm } from "@/components/admin/crm/NoteAddForm";
import { StatusUpdateForm } from "@/components/admin/crm/StatusUpdateForm";

describe("Admin CRM feedback states", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("shows loading and success feedback when adding a note", async () => {
    addEnquiryNoteActionMock.mockResolvedValue({ success: true, data: { id: "note-1" } });
    render(<NoteAddForm entityType="enquiry" entityId="enq-1" />);
    fireEvent.change(screen.getByLabelText(/note/i), { target: { value: "Call tomorrow" } });
    fireEvent.submit(
      screen.getByRole("button", { name: /add note/i }).closest("form") as HTMLFormElement,
    );
    expect(await screen.findByText(/note added/i)).toBeDefined();
  });

  it("preserves note text and re-enables submit after failure", async () => {
    addEnquiryNoteActionMock.mockResolvedValue({ success: false, error: "Could not save note" });
    render(<NoteAddForm entityType="enquiry" entityId="enq-1" />);
    const textarea = screen.getByLabelText(/note/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Keep this text" } });
    fireEvent.submit(
      screen.getByRole("button", { name: /add note/i }).closest("form") as HTMLFormElement,
    );
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: /add note/i }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(textarea.value).toBe("Keep this text");
    expect(screen.getByText(/could not save note/i)).toBeDefined();
  });

  it("shows generic error feedback when adding a note fails unexpectedly", async () => {
    addEnquiryNoteActionMock.mockResolvedValue({ success: false, error: "Something went wrong" });
    render(<NoteAddForm entityType="enquiry" entityId="enq-1" />);
    fireEvent.change(screen.getByLabelText(/note/i), { target: { value: "Call tomorrow" } });
    fireEvent.submit(
      screen.getByRole("button", { name: /add note/i }).closest("form") as HTMLFormElement,
    );
    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeDefined());
  });

  it("shows specific error feedback when status update returns an error", async () => {
    updateEnquiryStatusActionMock.mockResolvedValue({ success: false, error: "Update failed" });
    render(
      <StatusUpdateForm
        entityType="enquiry"
        entityId="enq-1"
        currentStatus="NEW"
        statuses={["NEW", "IN_PROGRESS"]}
      />,
    );
    fireEvent.submit(
      screen.getByRole("button", { name: /save/i }).closest("form") as HTMLFormElement,
    );
    await waitFor(() => expect(screen.getByText(/update failed/i)).toBeDefined());
  });

  it("shows generic error feedback when status update fails unexpectedly", async () => {
    updateEnquiryStatusActionMock.mockResolvedValue({
      success: false,
      error: "Something went wrong",
    });
    render(
      <StatusUpdateForm
        entityType="enquiry"
        entityId="enq-1"
        currentStatus="NEW"
        statuses={["NEW", "IN_PROGRESS"]}
      />,
    );
    fireEvent.submit(
      screen.getByRole("button", { name: /save/i }).closest("form") as HTMLFormElement,
    );
    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeDefined());
  });
});
