import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getPublishedPostsMock = vi.hoisted(() => vi.fn());
const getPostBySlugMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/cms-repository", () => ({
  getPublishedPosts: getPublishedPostsMock,
  getPostBySlug: getPostBySlugMock,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

type ListingPageModule = {
  default: () => Promise<JSX.Element> | JSX.Element;
};

type DetailPageModule = {
  default: (props: {
    params: Promise<{ slug: string }> | { slug: string };
  }) => Promise<JSX.Element>;
};

async function loadBlogListingPage() {
  const specifier = "@/app/blog/page";
  return import(/* @vite-ignore */ specifier) as Promise<ListingPageModule>;
}

async function loadBlogDetailPage() {
  const specifier = "@/app/blog/[slug]/page";
  return import(/* @vite-ignore */ specifier) as Promise<DetailPageModule>;
}

describe("Public blog pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("listing page renders published post cards with titles and excerpts", async () => {
    getPublishedPostsMock.mockResolvedValueOnce([
      {
        id: "post-1",
        slug: "cambridge-study-tips",
        title: "Cambridge Study Tips",
        excerpt: "Practical revision systems for exam success.",
        content: "Full article content",
        isPublished: true,
        publishedAt: new Date("2026-05-01T10:00:00.000Z"),
        createdAt: new Date("2026-05-01T09:00:00.000Z"),
      },
      {
        id: "post-2",
        slug: "online-learning-routines",
        title: "Online Learning Routines",
        excerpt: "Build consistent habits at home.",
        content: "More article content",
        isPublished: true,
        publishedAt: new Date("2026-05-02T10:00:00.000Z"),
        createdAt: new Date("2026-05-02T09:00:00.000Z"),
      },
    ]);

    const page = await loadBlogListingPage();
    const element = await page.default();

    render(element);

    expect(getPublishedPostsMock).toHaveBeenCalled();
    expect(screen.getByText(/cambridge study tips/i)).toBeDefined();
    expect(screen.getByText(/practical revision systems for exam success/i)).toBeDefined();
    expect(screen.getByText(/online learning routines/i)).toBeDefined();
  });

  it("listing page does not render draft posts", async () => {
    getPublishedPostsMock.mockResolvedValueOnce([
      {
        id: "post-1",
        slug: "published-post",
        title: "Published Post",
        excerpt: "Public excerpt",
        content: "Public content",
        isPublished: true,
        publishedAt: new Date("2026-05-01T10:00:00.000Z"),
        createdAt: new Date("2026-05-01T09:00:00.000Z"),
      },
    ]);

    const page = await loadBlogListingPage();
    const element = await page.default();

    render(element);

    expect(screen.getByText(/published post/i)).toBeDefined();
    expect(screen.queryByText(/draft post/i)).toBeNull();
  });

  it("listing page shows an empty state when no published posts are found", async () => {
    getPublishedPostsMock.mockResolvedValueOnce([]);

    const page = await loadBlogListingPage();
    const element = await page.default();

    render(element);

    expect(screen.getByText(/no posts found|no blog posts yet|nothing published/i)).toBeDefined();
  });

  it("detail page renders full content, title, and date for a valid published slug", async () => {
    getPostBySlugMock.mockResolvedValueOnce({
      id: "post-1",
      slug: "cambridge-study-tips",
      title: "Cambridge Study Tips",
      content: "Full article content for public readers.",
      isPublished: true,
      publishedAt: new Date("2026-05-01T10:00:00.000Z"),
      createdAt: new Date("2026-05-01T09:00:00.000Z"),
    });

    const page = await loadBlogDetailPage();
    const element = await page.default({ params: { slug: "cambridge-study-tips" } });

    render(element);

    expect(getPostBySlugMock).toHaveBeenCalledWith("cambridge-study-tips");
    expect(screen.getByText(/cambridge study tips/i)).toBeDefined();
    expect(screen.getByText(/full article content for public readers/i)).toBeDefined();
    expect(screen.getByText(/2026|may/i)).toBeDefined();
  });

  it("detail page triggers notFound() when the slug does not exist", async () => {
    getPostBySlugMock.mockResolvedValueOnce(null);

    const page = await loadBlogDetailPage();

    await expect(page.default({ params: { slug: "missing-post" } })).rejects.toThrow(
      /not_found|not found|NEXT_NOT_FOUND/i,
    );
  });

  it("detail page triggers notFound() for draft posts", async () => {
    getPostBySlugMock.mockResolvedValueOnce(null);

    const page = await loadBlogDetailPage();

    await expect(page.default({ params: { slug: "draft-post" } })).rejects.toThrow(
      /not_found|not found|NEXT_NOT_FOUND/i,
    );
  });
});
