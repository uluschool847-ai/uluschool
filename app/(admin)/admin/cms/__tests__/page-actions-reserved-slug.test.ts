import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const createPageMock = vi.hoisted(() => vi.fn());
const updatePageMock = vi.hoisted(() => vi.fn());
const getPageMock = vi.hoisted(() => vi.fn());
const getBlogPostMock = vi.hoisted(() => vi.fn());
const canCreateCmsPageMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/cms-repository", () => ({
  createPage: createPageMock,
  updatePage: updatePageMock,
  getPage: getPageMock,
  getBlogPost: getBlogPostMock,
  createBlogPost: vi.fn(),
  updateBlogPost: vi.fn(),
  deleteBlogPost: vi.fn(),
  createFaqItem: vi.fn(),
  updateFaqItem: vi.fn(),
  deleteFaqItem: vi.fn(),
  deletePage: vi.fn(),
}));

vi.mock("@/lib/cms/page-guard", () => ({
  canCreateCmsPage: canCreateCmsPageMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

type CmsActionsModule = {
  savePageAction: (
    formData: FormData,
  ) => Promise<{ success: false; errors: Record<string, string[] | undefined> } | undefined>;
};

async function loadCmsActions() {
  const specifier = "@/app/(admin)/admin/cms/actions";
  return import(/* @vite-ignore */ specifier) as Promise<CmsActionsModule>;
}

function buildPageFormData(slug: string) {
  const formData = new FormData();
  formData.set("slug", slug);
  formData.set("title", "Reserved slug page");
  formData.set("content", "{}");
  formData.set("isPublished", "true");
  return formData;
}

describe("CMS page creation reserved slug validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
    canCreateCmsPageMock.mockReturnValue(true);
  });

  it("returns a validation error when an admin tries to create a page with a reserved slug", async () => {
    canCreateCmsPageMock.mockReturnValueOnce(false);

    const { savePageAction } = await loadCmsActions();
    const result = await savePageAction(buildPageFormData("blog"));

    expect(result).toEqual({
      success: false,
      errors: {
        slug: ["This slug is reserved by a static route and cannot be managed in CMS."],
      },
    });
    expect(createPageMock).not.toHaveBeenCalled();
    expect(updatePageMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
