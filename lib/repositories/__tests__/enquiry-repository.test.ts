import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  level: {
    findFirst: vi.fn(),
  },
  enquiry: {
    create: vi.fn(),
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  enquiryNote: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  enquiryTimelineEvent: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import * as enquiryRepository from "@/lib/repositories/enquiry-repository";

type CrmStatus = "NEW" | "IN_PROGRESS" | "CONVERTED" | "REJECTED";

type CrmNote = {
  id: string;
  entityId: string;
  authorId: string;
  content: string;
  createdAt: Date;
};

type CrmTimelineEvent = {
  id: string;
  entityId: string;
  type: "STATUS_CHANGED" | "NOTE_CREATED" | "ASSIGNED";
  message: string;
  createdAt: Date;
  actorId: string;
  meta?: Record<string, unknown>;
};

type CrmPaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type EnquiryWithTimeline = {
  id: string;
  studentName: string;
  email: string;
  status: CrmStatus;
  notes: CrmNote[];
  timeline: CrmTimelineEvent[];
};

type EnquiryRepositoryContract = {
  findAllEnquiries(input: {
    page: number;
    limit: number;
    searchQuery?: string;
    statusFilter?: CrmStatus;
  }): Promise<CrmPaginatedResult<EnquiryWithTimeline>>;
  getEnquiryCaseById(id: string): Promise<EnquiryWithTimeline | null>;
  updateEnquiryStatus(input: {
    id: string;
    status: CrmStatus;
    actorId: string;
  }): Promise<EnquiryWithTimeline>;
  addEnquiryNote(input: {
    enquiryId: string;
    authorId: string;
    content: string;
  }): Promise<CrmNote>;
  getEnquiryTimeline(enquiryId: string): Promise<CrmTimelineEvent[]>;
};

const repo = enquiryRepository as unknown as EnquiryRepositoryContract;

describe("enquiry-repository CRM-lite contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: unknown) => {
      if (typeof callback === "function") {
        return callback(prismaMock);
      }
      return callback;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores the fixed consent version and server time for a new enquiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T09:30:00.000Z"));
    prismaMock.level.findFirst.mockResolvedValue({ id: "level-1" });
    prismaMock.enquiry.create.mockResolvedValue({ id: "enq-1" });

    await enquiryRepository.createEnquiry({
      studentName: "Daniel Student",
      ageYearLevel: "Grade 6",
      subjects: ["Biology"],
      curriculumLevel: "grade-6",
      parentGuardianName: "Grace Parent",
      email: "grace@example.com",
      phoneWhatsapp: "+254711111111",
      preferredSchedule: "Weekdays after 4pm",
      additionalNotes: "",
      consentAccepted: true,
    });

    expect(prismaMock.enquiry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        consentVersion: "enrolment-consent-v1",
        consentGivenAt: new Date("2026-07-13T09:30:00.000Z"),
      }),
    });
  });

  it("findAllEnquiries should return total count and paginated search results", async () => {
    const now = new Date("2026-05-01T10:00:00.000Z");
    prismaMock.enquiry.count.mockResolvedValueOnce(2);
    prismaMock.enquiry.findMany.mockResolvedValueOnce([
      {
        id: "enq-1",
        studentName: "Alice Student",
        email: "parent@example.com",
        status: "NEW",
        notes: [],
        timeline: [],
        createdAt: now,
      },
      {
        id: "enq-2",
        studentName: "Alice Junior",
        email: "family@example.com",
        status: "IN_PROGRESS",
        notes: [],
        timeline: [],
        createdAt: now,
      },
    ]);

    const result = await repo.findAllEnquiries({
      page: 1,
      limit: 10,
      searchQuery: "alice",
      statusFilter: "NEW",
    });

    expect(prismaMock.enquiry.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: "NEW",
        OR: expect.any(Array),
      }),
    });
    expect(prismaMock.enquiry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 10,
        orderBy: { createdAt: "desc" },
      }),
    );
    expect(result).toEqual({
      data: expect.any(Array),
      total: 2,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
  });

  it("findAllEnquiries should return an empty page when search has no matches", async () => {
    prismaMock.enquiry.count.mockResolvedValueOnce(0);
    prismaMock.enquiry.findMany.mockResolvedValueOnce([]);

    const result = await repo.findAllEnquiries({
      page: 1,
      limit: 25,
      searchQuery: "no-match",
    });

    expect(result).toEqual({
      data: [],
      total: 0,
      page: 1,
      limit: 25,
      totalPages: 0,
    });
  });

  it("findAllEnquiries should reject invalid pagination parameters", async () => {
    await expect(
      repo.findAllEnquiries({
        page: -1,
        limit: 10,
      }),
    ).rejects.toThrow(/page|pagination|invalid/i);

    expect(prismaMock.enquiry.findMany).not.toHaveBeenCalled();
  });

  it("getEnquiryCaseById should fetch one enquiry with notes and timeline relations", async () => {
    const note = {
      id: "note-1",
      entityId: "enq-1",
      authorId: "admin-1",
      content: "Parent asked for evening classes.",
      createdAt: new Date("2026-05-01T10:30:00.000Z"),
    };
    const timelineEvent = {
      id: "event-1",
      entityId: "enq-1",
      type: "NOTE_CREATED",
      message: "Note added",
      actorId: "admin-1",
      createdAt: new Date("2026-05-01T10:30:00.000Z"),
    };

    prismaMock.enquiry.findUnique.mockResolvedValueOnce({
      id: "enq-1",
      studentName: "Alice Student",
      email: "parent@example.com",
      status: "IN_PROGRESS",
      notes: [note],
      timeline: [timelineEvent],
    });

    const result = await repo.getEnquiryCaseById("enq-1");

    expect(prismaMock.enquiry.findUnique).toHaveBeenCalledWith({
      where: { id: "enq-1" },
      include: expect.objectContaining({
        notes: expect.any(Object),
        timeline: expect.any(Object),
      }),
    });
    expect(result?.notes).toEqual([note]);
    expect(result?.timeline).toEqual([timelineEvent]);
  });

  it("updateEnquiryStatus should update status and create a timeline entry atomically", async () => {
    prismaMock.enquiry.update.mockResolvedValueOnce({
      id: "enq-1",
      studentName: "Alice Student",
      email: "parent@example.com",
      status: "IN_PROGRESS",
      notes: [],
      timeline: [],
    });
    prismaMock.enquiryTimelineEvent.create.mockResolvedValueOnce({
      id: "event-1",
      entityId: "enq-1",
      type: "STATUS_CHANGED",
      message: "Status changed from NEW to IN_PROGRESS",
      actorId: "admin-1",
      createdAt: new Date(),
    });

    const result = await repo.updateEnquiryStatus({
      id: "enq-1",
      status: "IN_PROGRESS",
      actorId: "admin-1",
    });

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(prismaMock.enquiry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "enq-1" },
        data: expect.objectContaining({ status: "IN_PROGRESS" }),
      }),
    );
    expect(prismaMock.enquiryTimelineEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityId: "enq-1",
          type: "STATUS_CHANGED",
          actorId: "admin-1",
        }),
      }),
    );
    expect(result.status).toBe("IN_PROGRESS");
  });

  it("updateEnquiryStatus should reject unauthorized status transitions", async () => {
    await expect(
      repo.updateEnquiryStatus({
        id: "enq-1",
        status: "CONVERTED",
        actorId: "teacher-1",
      }),
    ).rejects.toThrow(/unauthorized|forbidden|transition/i);
  });

  it("addEnquiryNote should create a note and timeline entry", async () => {
    const createdNote = {
      id: "note-1",
      entityId: "enq-1",
      authorId: "admin-1",
      content: "Call scheduled for Friday.",
      createdAt: new Date("2026-05-01T11:00:00.000Z"),
    };
    prismaMock.enquiryNote.create.mockResolvedValueOnce(createdNote);
    prismaMock.enquiryTimelineEvent.create.mockResolvedValueOnce({
      id: "event-1",
      entityId: "enq-1",
      type: "NOTE_CREATED",
      message: "Note added",
      actorId: "admin-1",
      createdAt: createdNote.createdAt,
    });

    const result = await repo.addEnquiryNote({
      enquiryId: "enq-1",
      authorId: "admin-1",
      content: "Call scheduled for Friday.",
    });

    expect(prismaMock.enquiryNote.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityId: "enq-1",
        authorId: "admin-1",
        content: "Call scheduled for Friday.",
      }),
    });
    expect(prismaMock.enquiryTimelineEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "NOTE_CREATED",
          entityId: "enq-1",
        }),
      }),
    );
    expect(result).toEqual(createdNote);
  });

  it("addEnquiryNote should reject empty or oversized note content", async () => {
    await expect(
      repo.addEnquiryNote({
        enquiryId: "enq-1",
        authorId: "admin-1",
        content: "   ",
      }),
    ).rejects.toThrow(/note|content|required/i);

    await expect(
      repo.addEnquiryNote({
        enquiryId: "enq-1",
        authorId: "admin-1",
        content: "x".repeat(5001),
      }),
    ).rejects.toThrow(/note|content|limit|too long/i);
  });

  it("getEnquiryTimeline should return chronological status, note, and assignment events", async () => {
    const timeline = [
      {
        id: "event-1",
        entityId: "enq-1",
        type: "STATUS_CHANGED",
        message: "Status changed to IN_PROGRESS",
        actorId: "admin-1",
        createdAt: new Date("2026-05-01T10:00:00.000Z"),
      },
      {
        id: "event-2",
        entityId: "enq-1",
        type: "NOTE_CREATED",
        message: "Note added",
        actorId: "admin-1",
        createdAt: new Date("2026-05-01T10:05:00.000Z"),
      },
      {
        id: "event-3",
        entityId: "enq-1",
        type: "ASSIGNED",
        message: "Assigned to admissions manager",
        actorId: "admin-2",
        createdAt: new Date("2026-05-01T10:10:00.000Z"),
      },
    ];
    prismaMock.enquiryTimelineEvent.findMany.mockResolvedValueOnce(timeline);

    const result = await repo.getEnquiryTimeline("enq-1");

    expect(prismaMock.enquiryTimelineEvent.findMany).toHaveBeenCalledWith({
      where: { entityId: "enq-1" },
      orderBy: { createdAt: "asc" },
    });
    expect(result.map((event) => event.type)).toEqual([
      "STATUS_CHANGED",
      "NOTE_CREATED",
      "ASSIGNED",
    ]);
  });
});
