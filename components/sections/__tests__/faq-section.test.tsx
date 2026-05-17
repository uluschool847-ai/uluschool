import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getPublishedFaqItemsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/cms-repository", () => ({
  getPublishedFaqItems: getPublishedFaqItemsMock,
}));

type FaqSectionModule = {
  FaqSection: () => JSX.Element | Promise<JSX.Element>;
};

async function loadFaqSection() {
  const specifier = "@/components/sections/faq-section";
  return import(/* @vite-ignore */ specifier) as Promise<FaqSectionModule>;
}

describe("FaqSection CMS-backed public rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("calls the CMS repository to fetch published FAQ items", async () => {
    getPublishedFaqItemsMock.mockResolvedValueOnce([]);
    const { FaqSection } = await loadFaqSection();

    const element = await FaqSection();
    render(element);

    expect(getPublishedFaqItemsMock).toHaveBeenCalled();
  });

  it("renders question and answer content returned from the database", async () => {
    getPublishedFaqItemsMock.mockResolvedValueOnce([
      {
        id: "faq-1",
        question: "Do students get recorded lessons?",
        answer: "Yes, recorded lessons are available after class.",
        status: "published",
        displayOrder: 1,
      },
    ]);
    const { FaqSection } = await loadFaqSection();

    const element = await FaqSection();
    render(element);

    expect(screen.getByText(/do students get recorded lessons\?/i)).toBeDefined();
    expect(screen.getByText(/recorded lessons are available after class/i)).toBeDefined();
  });

  it("does not render draft FAQ items in the public section", async () => {
    getPublishedFaqItemsMock.mockResolvedValueOnce([
      {
        id: "faq-1",
        question: "Published question",
        answer: "Published answer",
        status: "published",
        displayOrder: 1,
      },
      {
        id: "faq-2",
        question: "Draft question",
        answer: "Draft answer",
        status: "draft",
        displayOrder: 2,
      },
    ]);
    const { FaqSection } = await loadFaqSection();

    const element = await FaqSection();
    render(element);

    expect(screen.getByText(/published question/i)).toBeDefined();
    expect(screen.queryByText(/draft question/i)).toBeNull();
    expect(screen.queryByText(/draft answer/i)).toBeNull();
  });
});
