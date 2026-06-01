import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const getEnquiryByIdMock = vi.hoisted(() => vi.fn());
const updateEnquiryStatusMock = vi.hoisted(() => vi.fn());
const addEnquiryNoteMock = vi.hoisted(() => vi.fn());
const getContactLeadByIdMock = vi.hoisted(() => vi.fn());
const updateContactLeadStatusMock = vi.hoisted(() => vi.fn());
const addContactLeadNoteMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
}));

vi.mock("@/lib/repositories/enquiry-repository", () => ({
  addEnquiryNote: addEnquiryNoteMock,
  getEnquiryById: getEnquiryByIdMock,
  updateEnquiryStatus: updateEnquiryStatusMock,
}));

vi.mock("@/lib/repositories/contact-lead-repository", () => ({
  addContactLeadNote: addContactLeadNoteMock,
  getContactLeadById: getContactLeadByIdMock,
  updateContactLeadStatus: updateContactLeadStatusMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

type CrmActionsModule = {
  addContactLeadNoteAction: (input: { id: string; content: string }) => Promise<unknown>;
  addEnquiryNoteAction: (input: { id: string; content: string }) => Promise<unknown>;
  updateContactLeadStatusAction: (input: { id: string; status: string }) => Promise<unknown>;
  updateEnquiryStatusAction: (input: { id: string; status: string }) => Promise<unknown>;
};

async function loadCrmActions() {
  const specifier = "@/app/(admin)/admin/crm/actions";
  return import(/* @vite-ignore */ specifier) as Promise<CrmActionsModule>;
}

function auditPayloadFor(action: string) {
  return createAdminAuditLogMock.mock.calls.find(([payload]) => payload?.action === action)?.[0];
}

function expectEnquiryPathsRevalidated(id = "enquiry-1") {
  expect(revalidatePathMock).toHaveBeenCalledWith("/admin");
  expect(revalidatePathMock).toHaveBeenCalledWith("/admin/submissions");
  expect(revalidatePathMock).toHaveBeenCalledWith(`/admin/enquiries/${id}`);
}

function expectLeadPathsRevalidated(id = "lead-1") {
  expect(revalidatePathMock).toHaveBeenCalledWith("/admin");
  expect(revalidatePathMock).toHaveBeenCalledWith("/admin/leads");
  expect(revalidatePathMock).toHaveBeenCalledWith(`/admin/leads/${id}`);
}

describe("Admin CRM detail actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: UserRole.ADMIN });
    getEnquiryByIdMock.mockResolvedValue({
      id: "enquiry-1",
      status: "NEW",
      updatedAt: new Date("2026-05-01T10:00:00.000Z"),
    });
    getContactLeadByIdMock.mockResolvedValue({
      id: "lead-1",
      status: "NEW",
      updatedAt: new Date("2026-05-01T10:00:00.000Z"),
    });
    updateEnquiryStatusMock.mockResolvedValue({
      id: "enquiry-1",
      status: "IN_PROGRESS",
      updatedAt: new Date("2026-05-01T11:00:00.000Z"),
    });
    updateContactLeadStatusMock.mockResolvedValue({
      id: "lead-1",
      status: "CONVERTED",
      updatedAt: new Date("2026-05-01T11:00:00.000Z"),
    });
    addEnquiryNoteMock.mockResolvedValue({
      content: "Call parent tomorrow.",
      createdAt: new Date("2026-05-01T12:00:00.000Z"),
      id: "enquiry-note-1",
    });
    addContactLeadNoteMock.mockResolvedValue({
      content: "Sent pricing details.",
      createdAt: new Date("2026-05-01T12:00:00.000Z"),
      id: "lead-note-1",
    });
  });

  it("audits and revalidates successful enquiry status changes", async () => {
    const actions = await loadCrmActions();

    const result = await actions.updateEnquiryStatusAction({
      id: "enquiry-1",
      status: "IN_PROGRESS",
    });

    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(updateEnquiryStatusMock).toHaveBeenCalledWith({
      actorId: "admin-1",
      id: "enquiry-1",
      status: "IN_PROGRESS",
    });
    expect(auditPayloadFor("ENQUIRY_STATUS_UPDATED")).toEqual(
      expect.objectContaining({
        adminUserId: "admin-1",
        targetId: "enquiry-1",
        targetType: "Enquiry",
      }),
    );
    expectEnquiryPathsRevalidated();
  });

  it("audits and revalidates successful contact lead status changes", async () => {
    const actions = await loadCrmActions();

    const result = await actions.updateContactLeadStatusAction({
      id: "lead-1",
      status: "CONVERTED",
    });

    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(updateContactLeadStatusMock).toHaveBeenCalledWith({
      actorId: "admin-1",
      id: "lead-1",
      status: "CONVERTED",
    });
    expect(auditPayloadFor("CONTACT_LEAD_STATUS_UPDATED")).toEqual(
      expect.objectContaining({
        adminUserId: "admin-1",
        targetId: "lead-1",
        targetType: "ContactLead",
      }),
    );
    expectLeadPathsRevalidated();
  });

  it("audits note creation without writing note body into the audit snapshot", async () => {
    const actions = await loadCrmActions();

    const result = await actions.addEnquiryNoteAction({
      id: "enquiry-1",
      content: "Call parent tomorrow.",
    });

    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(addEnquiryNoteMock).toHaveBeenCalledWith({
      authorId: "admin-1",
      content: "Call parent tomorrow.",
      enquiryId: "enquiry-1",
    });
    expect(auditPayloadFor("ENQUIRY_NOTE_ADDED")).toEqual(
      expect.objectContaining({
        after: expect.objectContaining({
          contentLength: "Call parent tomorrow.".length,
          id: "enquiry-note-1",
        }),
        targetId: "enquiry-1",
      }),
    );
    expect(JSON.stringify(auditPayloadFor("ENQUIRY_NOTE_ADDED"))).not.toContain(
      "Call parent tomorrow.",
    );
    expectEnquiryPathsRevalidated();
  });

  it("audits contact lead notes and revalidates lead surfaces", async () => {
    const actions = await loadCrmActions();

    const result = await actions.addContactLeadNoteAction({
      id: "lead-1",
      content: "Sent pricing details.",
    });

    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(addContactLeadNoteMock).toHaveBeenCalledWith({
      authorId: "admin-1",
      content: "Sent pricing details.",
      leadId: "lead-1",
    });
    expect(auditPayloadFor("CONTACT_LEAD_NOTE_ADDED")).toEqual(
      expect.objectContaining({
        after: expect.objectContaining({
          contentLength: "Sent pricing details.".length,
          id: "lead-note-1",
        }),
        targetId: "lead-1",
      }),
    );
    expectLeadPathsRevalidated();
  });

  it("does not write success audit or revalidate on invalid status input", async () => {
    const actions = await loadCrmActions();

    const result = await actions.updateEnquiryStatusAction({
      id: "enquiry-1",
      status: "BROKEN",
    });

    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(updateEnquiryStatusMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not write success audit or revalidate when the mutation fails", async () => {
    updateContactLeadStatusMock.mockRejectedValueOnce(new Error("Lead not found."));
    const actions = await loadCrmActions();

    const result = await actions.updateContactLeadStatusAction({
      id: "lead-1",
      status: "REJECTED",
    });

    expect(result).toEqual(
      expect.objectContaining({
        error: "Lead not found.",
        success: false,
      }),
    );
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not call repositories, audit, or revalidation for blank notes", async () => {
    const actions = await loadCrmActions();

    const result = await actions.addEnquiryNoteAction({
      id: "enquiry-1",
      content: "   ",
    });

    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(addEnquiryNoteMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
