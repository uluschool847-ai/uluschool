import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  contactLead: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  contactLeadNote: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  contactLeadTimelineEvent: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import * as contactLeadRepository from "@/lib/repositories/contact-lead-repository";

type CrmStatus = "NEW" | "IN_PROGRESS" | "CONVERTED" | "REJECTED";

type LeadNote = {
  id: string;
  leadId: string;
  authorId: string;
  content: string;
  createdAt: Date;
};

type LeadTimelineEvent = {
  id: string;
  leadId: string;
  type: "STATUS_CHANGED" | "NOTE_CREATED" | "ASSIGNED";
  message: string;
  actorId: string;
  createdAt: Date;
  meta?: Record<string, unknown>;
};

type PaginatedLeadResult<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type ContactLeadWithTimeline = {
  id: string;
  fullName: string;
  email: string;
  phoneWhatsapp: string | null;
  status: CrmStatus;
  notes: LeadNote[];
  timeline: LeadTimelineEvent[];
};

type ContactLeadRepositoryContract = {
  findAllContactLeads(input: {
    page: number;
    limit: number;
    searchQuery?: string;
    statusFilter?: CrmStatus;
  }): Promise<PaginatedLeadResult<ContactLeadWithTimeline>>;
  getContactLeadCaseById(id: string): Promise<ContactLeadWithTimeline | null>;
  updateContactLeadStatus(input: {
    id: string;
    status: CrmStatus;
    actorId: string;
  }): Promise<ContactLeadWithTimeline>;
  addContactLeadNote(input: {
    leadId: string;
    authorId: string;
    content: string;
  }): Promise<LeadNote>;
  getContactLeadTimeline(leadId: string): Promise<LeadTimelineEvent[]>;
};

const repo = contactLeadRepository as unknown as ContactLeadRepositoryContract;

describe("contact-lead-repository CRM-lite contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: unknown) => {
      if (typeof callback === "function") {
        return callback(prismaMock);
      }
      return callback;
    });
  });

  it("findAllContactLeads should return total count and paginated search results", async () => {
    prismaMock.contactLead.count.mockResolvedValueOnce(3);
    prismaMock.contactLead.findMany.mockResolvedValueOnce([
      {
        id: "lead-1",
        fullName: "Maria Parent",
        email: "maria@example.com",
        phoneWhatsapp: "+100000000",
        status: "NEW",
        notes: [],
        timeline: [],
      },
      {
        id: "lead-2",
        fullName: "Mary Guardian",
        email: "mary@example.com",
        phoneWhatsapp: null,
        status: "NEW",
        notes: [],
        timeline: [],
      },
    ]);

    const result = await repo.findAllContactLeads({
      page: 2,
      limit: 2,
      searchQuery: "mar",
      statusFilter: "NEW",
    });

    expect(prismaMock.contactLead.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: "NEW",
        OR: expect.any(Array),
      }),
    });
    expect(prismaMock.contactLead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 2,
        take: 2,
        orderBy: { createdAt: "desc" },
      }),
    );
    expect(result).toEqual({
      data: expect.any(Array),
      total: 3,
      page: 2,
      limit: 2,
      totalPages: 2,
    });
  });

  it("findAllContactLeads should handle empty search results", async () => {
    prismaMock.contactLead.count.mockResolvedValueOnce(0);
    prismaMock.contactLead.findMany.mockResolvedValueOnce([]);

    const result = await repo.findAllContactLeads({
      page: 1,
      limit: 10,
      searchQuery: "missing",
    });

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  it("findAllContactLeads should reject invalid limit and page values", async () => {
    await expect(
      repo.findAllContactLeads({
        page: 0,
        limit: 10,
      }),
    ).rejects.toThrow(/page|pagination|invalid/i);

    await expect(
      repo.findAllContactLeads({
        page: 1,
        limit: 0,
      }),
    ).rejects.toThrow(/limit|pagination|invalid/i);

    expect(prismaMock.contactLead.findMany).not.toHaveBeenCalled();
  });

  it("getContactLeadCaseById should fetch lead detail with notes and timeline relations", async () => {
    const note = {
      id: "note-1",
      leadId: "lead-1",
      authorId: "admin-1",
      content: "Asked about Biology.",
      createdAt: new Date("2026-05-01T12:00:00.000Z"),
    };
    const event = {
      id: "event-1",
      leadId: "lead-1",
      type: "NOTE_CREATED",
      message: "Note added",
      actorId: "admin-1",
      createdAt: note.createdAt,
    };

    prismaMock.contactLead.findUnique.mockResolvedValueOnce({
      id: "lead-1",
      fullName: "Maria Parent",
      email: "maria@example.com",
      phoneWhatsapp: "+100000000",
      status: "IN_PROGRESS",
      notes: [note],
      timeline: [event],
    });

    const result = await repo.getContactLeadCaseById("lead-1");

    expect(prismaMock.contactLead.findUnique).toHaveBeenCalledWith({
      where: { id: "lead-1" },
      include: expect.objectContaining({
        notes: expect.any(Object),
        timeline: expect.any(Object),
      }),
    });
    expect(result?.notes).toEqual([note]);
    expect(result?.timeline).toEqual([event]);
  });

  it("updateContactLeadStatus should update status and append timeline entry", async () => {
    prismaMock.contactLead.update.mockResolvedValueOnce({
      id: "lead-1",
      fullName: "Maria Parent",
      email: "maria@example.com",
      phoneWhatsapp: "+100000000",
      status: "CONVERTED",
      notes: [],
      timeline: [],
    });
    prismaMock.contactLeadTimelineEvent.create.mockResolvedValueOnce({
      id: "event-1",
      leadId: "lead-1",
      type: "STATUS_CHANGED",
      message: "Status changed to CONVERTED",
      actorId: "admin-1",
      createdAt: new Date(),
    });

    const result = await repo.updateContactLeadStatus({
      id: "lead-1",
      status: "CONVERTED",
      actorId: "admin-1",
    });

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(prismaMock.contactLead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lead-1" },
        data: expect.objectContaining({ status: "CONVERTED" }),
      }),
    );
    expect(prismaMock.contactLeadTimelineEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          leadId: "lead-1",
          type: "STATUS_CHANGED",
          actorId: "admin-1",
        }),
      }),
    );
    expect(result.status).toBe("CONVERTED");
  });

  it("updateContactLeadStatus should reject unauthorized status transitions", async () => {
    await expect(
      repo.updateContactLeadStatus({
        id: "lead-1",
        status: "CONVERTED",
        actorId: "student-1",
      }),
    ).rejects.toThrow(/unauthorized|forbidden|transition/i);
  });

  it("addContactLeadNote should validate content and create note plus timeline entry", async () => {
    const note = {
      id: "note-1",
      leadId: "lead-1",
      authorId: "admin-1",
      content: "Sent pricing details.",
      createdAt: new Date("2026-05-01T12:30:00.000Z"),
    };
    prismaMock.contactLeadNote.create.mockResolvedValueOnce(note);
    prismaMock.contactLeadTimelineEvent.create.mockResolvedValueOnce({
      id: "event-1",
      leadId: "lead-1",
      type: "NOTE_CREATED",
      message: "Note added",
      actorId: "admin-1",
      createdAt: note.createdAt,
    });

    const result = await repo.addContactLeadNote({
      leadId: "lead-1",
      authorId: "admin-1",
      content: "Sent pricing details.",
    });

    expect(prismaMock.contactLeadNote.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        leadId: "lead-1",
        authorId: "admin-1",
        content: "Sent pricing details.",
      }),
    });
    expect(prismaMock.contactLeadTimelineEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          leadId: "lead-1",
          type: "NOTE_CREATED",
        }),
      }),
    );
    expect(result).toEqual(note);
  });

  it("addContactLeadNote should reject empty notes and notes exceeding character limit", async () => {
    await expect(
      repo.addContactLeadNote({
        leadId: "lead-1",
        authorId: "admin-1",
        content: "",
      }),
    ).rejects.toThrow(/note|content|required/i);

    await expect(
      repo.addContactLeadNote({
        leadId: "lead-1",
        authorId: "admin-1",
        content: "x".repeat(5001),
      }),
    ).rejects.toThrow(/note|content|limit|too long/i);
  });

  it("getContactLeadTimeline should return chronological status, note, and assignment events", async () => {
    const timeline = [
      {
        id: "event-1",
        leadId: "lead-1",
        type: "STATUS_CHANGED",
        message: "Moved to IN_PROGRESS",
        actorId: "admin-1",
        createdAt: new Date("2026-05-01T08:00:00.000Z"),
      },
      {
        id: "event-2",
        leadId: "lead-1",
        type: "ASSIGNED",
        message: "Assigned to Polina",
        actorId: "admin-1",
        createdAt: new Date("2026-05-01T08:05:00.000Z"),
      },
      {
        id: "event-3",
        leadId: "lead-1",
        type: "NOTE_CREATED",
        message: "Note added",
        actorId: "admin-2",
        createdAt: new Date("2026-05-01T08:10:00.000Z"),
      },
    ];
    prismaMock.contactLeadTimelineEvent.findMany.mockResolvedValueOnce(timeline);

    const result = await repo.getContactLeadTimeline("lead-1");

    expect(prismaMock.contactLeadTimelineEvent.findMany).toHaveBeenCalledWith({
      where: { leadId: "lead-1" },
      orderBy: { createdAt: "asc" },
    });
    expect(result.map((event) => event.type)).toEqual([
      "STATUS_CHANGED",
      "ASSIGNED",
      "NOTE_CREATED",
    ]);
  });
});
