import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  faqItem: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

type CmsRepositoryModule = {
  getPublishedFaqItems: () => Promise<
    Array<{
      id: string;
      question: string;
      answer: string;
      displayOrder?: number;
      createdAt: Date;
      status?: "published" | "draft";
    }>
  >;
};

async function loadCmsRepository() {
  const specifier = "@/lib/repositories/cms-repository";
  return import(/* @vite-ignore */ specifier) as Promise<CmsRepositoryModule>;
}

describe("cms-repository FAQ queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getPublishedFaqItems retrieves only published FAQ items", async () => {
    prismaMock.faqItem.findMany.mockResolvedValueOnce([
      {
        id: "faq-1",
        question: "How do live classes work?",
        answer: "Students join online lessons with a teacher.",
        displayOrder: 1,
        status: "published",
        createdAt: new Date("2026-05-04T10:00:00.000Z"),
      },
    ]);

    const { getPublishedFaqItems } = await loadCmsRepository();
    const result = await getPublishedFaqItems();

    expect(prismaMock.faqItem.findMany).toHaveBeenCalledWith({
      where: { status: "published" },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: "faq-1",
        question: "How do live classes work?",
      }),
    ]);
  });

  it("getPublishedFaqItems returns items in the expected public order", async () => {
    prismaMock.faqItem.findMany.mockResolvedValueOnce([
      {
        id: "faq-1",
        question: "First question",
        answer: "First answer",
        displayOrder: 1,
        status: "published",
        createdAt: new Date("2026-05-01T08:00:00.000Z"),
      },
      {
        id: "faq-2",
        question: "Second question",
        answer: "Second answer",
        displayOrder: 2,
        status: "published",
        createdAt: new Date("2026-05-02T08:00:00.000Z"),
      },
    ]);

    const { getPublishedFaqItems } = await loadCmsRepository();
    const result = await getPublishedFaqItems();

    expect(result.map((item) => item.id)).toEqual(["faq-1", "faq-2"]);
  });

  it("getPublishedFaqItems returns an empty array when no published items exist", async () => {
    prismaMock.faqItem.findMany.mockResolvedValueOnce([]);

    const { getPublishedFaqItems } = await loadCmsRepository();
    const result = await getPublishedFaqItems();

    expect(result).toEqual([]);
  });
});
