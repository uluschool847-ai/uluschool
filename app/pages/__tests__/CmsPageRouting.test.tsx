import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getPublishedPageBySlugMock = vi.hoisted(() => vi.fn());
const isReservedSlugMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() => vi.fn(() => null));

vi.mock("@/lib/repositories/cms-repository", () => ({
  getPublishedPageBySlug: getPublishedPageBySlugMock,
}));

vi.mock("@/lib/cms/page-guard", () => ({
  isReservedSlug: isReservedSlugMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

vi.mock("@/components/cms/cms-page-content-renderer", () => ({
  CmsPageContentRenderer: ({ content }: { content: unknown }) => (
    <div data-testid="cms-content">{JSON.stringify(content)}</div>
  ),
  getCmsContentSummary: () => "CMS summary",
}));

vi.mock("@/components/sections/page-hero", () => ({
  PageHero: ({ title, description }: { title: string; description: string }) => (
    <section>
      <h1>{title}</h1>
      <p>{description}</p>
    </section>
  ),
}));

type CmsPageModule = {
  default: (props: { params: Promise<{ slug: string }> }) => Promise<JSX.Element> | JSX.Element;
};

async function loadCmsPageModule() {
  const specifier = "@/app/pages/[slug]/page";
  return import(/* @vite-ignore */ specifier) as Promise<CmsPageModule>;
}

describe("Public CMS page routing ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isReservedSlugMock.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
  });

  it("returns notFound for reserved slugs to prevent static route shadowing", async () => {
    isReservedSlugMock.mockReturnValueOnce(true);
    getPublishedPageBySlugMock.mockResolvedValueOnce({
      id: "page-1",
      slug: "blog",
      title: "Shadow Blog",
      content: { blocks: [{ type: "paragraph", text: "Should not render" }] },
    });

    const pageModule = await loadCmsPageModule();
    const element = await pageModule.default({ params: Promise.resolve({ slug: "blog" }) });

    render(element);

    expect(notFoundMock).toHaveBeenCalled();
    expect(screen.queryByText(/shadow blog/i)).toBeNull();
  });

  it("renders a valid non-reserved published CMS page", async () => {
    getPublishedPageBySlugMock.mockResolvedValueOnce({
      id: "page-1",
      slug: "privacy-policy",
      title: "Privacy Policy",
      content: { blocks: [{ type: "paragraph", text: "We respect your privacy." }] },
    });

    const pageModule = await loadCmsPageModule();
    const element = await pageModule.default({
      params: Promise.resolve({ slug: "privacy-policy" }),
    });

    render(element);

    expect(getPublishedPageBySlugMock).toHaveBeenCalledWith("privacy-policy");
    expect(screen.getByText(/privacy policy/i)).toBeDefined();
    expect(screen.getByTestId("cms-content").textContent).toContain("We respect your privacy.");
  });

  it("does not allow draft or missing CMS pages to render publicly", async () => {
    getPublishedPageBySlugMock.mockResolvedValueOnce(null);

    const pageModule = await loadCmsPageModule();
    const element = await pageModule.default({ params: Promise.resolve({ slug: "draft-policy" }) });

    render(element);

    expect(notFoundMock).toHaveBeenCalled();
    expect(screen.queryByText(/draft-policy/i)).toBeNull();
  });
});
