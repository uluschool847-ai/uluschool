import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  blogPost: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

type CmsRepositoryModule = {
  getPublishedPosts: () => Promise<
    Array<{
      id: string;
      slug: string;
      title: string;
      content: string;
      excerpt?: string;
      publishedAt: Date | null;
      createdAt: Date;
      isPublished?: boolean;
    }>
  >;
  getPostBySlug: (
    slug: string,
    options?: { preview?: boolean },
  ) => Promise<{
    id: string;
    slug: string;
    title: string;
    content: string;
    publishedAt: Date | null;
    createdAt: Date;
    isPublished?: boolean;
  } | null>;
};

async function loadCmsRepository() {
  const specifier = "@/lib/repositories/cms-repository";
  return import(/* @vite-ignore */ specifier) as Promise<CmsRepositoryModule>;
}

describe("cms-repository blog queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getPublishedPosts returns only published posts ordered by publishedAt or createdAt descending", async () => {
    prismaMock.blogPost.findMany.mockResolvedValueOnce([
      {
        id: "post-2",
        slug: "latest-post",
        title: "Latest Post",
        content: "Latest content",
        excerpt: "Latest excerpt",
        isPublished: true,
        publishedAt: new Date("2026-05-04T10:00:00.000Z"),
        createdAt: new Date("2026-05-04T09:00:00.000Z"),
      },
      {
        id: "post-1",
        slug: "older-post",
        title: "Older Post",
        content: "Older content",
        excerpt: "Older excerpt",
        isPublished: true,
        publishedAt: new Date("2026-05-03T10:00:00.000Z"),
        createdAt: new Date("2026-05-03T09:00:00.000Z"),
      },
    ]);

    const { getPublishedPosts } = await loadCmsRepository();
    const result = await getPublishedPosts();

    expect(prismaMock.blogPost.findMany).toHaveBeenCalledWith({
      where: { isPublished: true },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      include: { author: { select: { fullName: true } } },
    });
    expect(result.map((post) => post.slug)).toEqual(["latest-post", "older-post"]);
  });

  it("getPublishedPosts returns an empty array when no published posts exist", async () => {
    prismaMock.blogPost.findMany.mockResolvedValueOnce([]);

    const { getPublishedPosts } = await loadCmsRepository();
    const result = await getPublishedPosts();

    expect(result).toEqual([]);
  });

  it("getPostBySlug retrieves a published post by slug", async () => {
    prismaMock.blogPost.findFirst.mockResolvedValueOnce({
      id: "post-1",
      slug: "cambridge-study-tips",
      title: "Cambridge Study Tips",
      content: "Full article content",
      isPublished: true,
      publishedAt: new Date("2026-05-01T10:00:00.000Z"),
      createdAt: new Date("2026-05-01T09:00:00.000Z"),
      author: { fullName: "Admin User" },
    });

    const { getPostBySlug } = await loadCmsRepository();
    const result = await getPostBySlug("cambridge-study-tips");

    expect(prismaMock.blogPost.findFirst).toHaveBeenCalledWith({
      where: {
        slug: "cambridge-study-tips",
        isPublished: true,
      },
      include: { author: { select: { fullName: true } } },
    });
    expect(result).toEqual(expect.objectContaining({ slug: "cambridge-study-tips" }));
  });

  it("getPostBySlug returns null when the post exists but is still a draft", async () => {
    prismaMock.blogPost.findFirst.mockResolvedValueOnce(null);

    const { getPostBySlug } = await loadCmsRepository();
    const result = await getPostBySlug("draft-post");

    expect(result).toBeNull();
  });

  it("getPostBySlug can return a draft when preview override is enabled", async () => {
    prismaMock.blogPost.findFirst.mockResolvedValueOnce({
      id: "post-preview",
      slug: "draft-post",
      title: "Draft Post",
      content: "Draft content",
      isPublished: false,
      publishedAt: null,
      createdAt: new Date("2026-05-02T09:00:00.000Z"),
      author: { fullName: "Admin User" },
    });

    const { getPostBySlug } = await loadCmsRepository();
    const result = await getPostBySlug("draft-post", { preview: true });

    expect(prismaMock.blogPost.findFirst).toHaveBeenCalledWith({
      where: { slug: "draft-post" },
      include: { author: { select: { fullName: true } } },
    });
    expect(result).toEqual(expect.objectContaining({ slug: "draft-post" }));
  });
});
