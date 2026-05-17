import { beforeEach, describe, expect, it, vi } from "vitest";

const transactionClient = vi.hoisted(() => ({ tx: true }));
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn((callback: (tx: typeof transactionClient) => unknown) =>
    callback(transactionClient),
  ),
}));
const requireRoleMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const canCreateCmsPageMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());
const createPageMock = vi.hoisted(() => vi.fn());
const updatePageMock = vi.hoisted(() => vi.fn());
const deletePageMock = vi.hoisted(() => vi.fn());
const getPageMock = vi.hoisted(() => vi.fn());
const createBlogPostMock = vi.hoisted(() => vi.fn());
const updateBlogPostMock = vi.hoisted(() => vi.fn());
const deleteBlogPostMock = vi.hoisted(() => vi.fn());
const getBlogPostMock = vi.hoisted(() => vi.fn());
const createFaqItemMock = vi.hoisted(() => vi.fn());
const updateFaqItemMock = vi.hoisted(() => vi.fn());
const deleteFaqItemMock = vi.hoisted(() => vi.fn());
const getFaqItemMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
}));

vi.mock("@/lib/cms/page-guard", () => ({
  canCreateCmsPage: canCreateCmsPageMock,
}));

vi.mock("@/lib/repositories/cms-repository", () => ({
  createPage: createPageMock,
  updatePage: updatePageMock,
  deletePage: deletePageMock,
  getPage: getPageMock,
  createBlogPost: createBlogPostMock,
  updateBlogPost: updateBlogPostMock,
  deleteBlogPost: deleteBlogPostMock,
  getBlogPost: getBlogPostMock,
  createFaqItem: createFaqItemMock,
  updateFaqItem: updateFaqItemMock,
  deleteFaqItem: deleteFaqItemMock,
  getFaqItem: getFaqItemMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

type CmsActionsModule = {
  savePageAction: (formData: FormData) => Promise<unknown>;
  deletePageAction: (formData: FormData) => Promise<unknown>;
  saveBlogPostAction: (formData: FormData) => Promise<unknown>;
  deleteBlogPostAction: (formData: FormData) => Promise<unknown>;
  saveFaqItemAction: (formData: FormData) => Promise<unknown>;
  deleteFaqItemAction: (formData: FormData) => Promise<unknown>;
};

async function loadCmsActions() {
  const specifier = "@/app/(admin)/admin/cms/actions";
  return import(/* @vite-ignore */ specifier) as Promise<CmsActionsModule>;
}

function pageForm(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("slug", "qa-audit-page");
  formData.set("title", "QA Audit Page");
  formData.set("content", '{"blocks":[{"type":"paragraph","text":"Body"}]}');
  formData.set("isPublished", "true");
  for (const [key, value] of Object.entries(overrides)) formData.set(key, value);
  return formData;
}

function blogForm(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("slug", "qa-audit-blog");
  formData.set("title", "QA Audit Blog");
  formData.set("content", "Blog body");
  formData.set("isPublished", "true");
  for (const [key, value] of Object.entries(overrides)) formData.set(key, value);
  return formData;
}

function faqForm(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("category", "QA");
  formData.set("question", "Question?");
  formData.set("answer", "Answer.");
  formData.set("displayOrder", "2");
  for (const [key, value] of Object.entries(overrides)) formData.set(key, value);
  return formData;
}

function idForm(id: string) {
  const formData = new FormData();
  formData.set("id", id);
  return formData;
}

function auditPayloadFor(action: string) {
  return createAdminAuditLogMock.mock.calls.find(([payload]) => payload?.action === action);
}

describe("CMS admin actions audit trail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation((callback) => callback(transactionClient));
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
    createAdminAuditLogMock.mockResolvedValue({ id: "audit-1" });
    canCreateCmsPageMock.mockReturnValue(true);
  });

  it("audits CMS page create, update, and delete with before/after snapshots", async () => {
    const createdPage = {
      id: "page-1",
      slug: "qa-audit-page",
      title: "QA Audit Page",
      content: { blocks: [{ type: "paragraph", text: "Body" }] },
      isPublished: true,
    };
    const beforePage = { ...createdPage, title: "Before Page" };
    const updatedPage = { ...createdPage, title: "Updated Page" };
    createPageMock.mockResolvedValueOnce(createdPage);
    getPageMock.mockResolvedValueOnce(beforePage);
    updatePageMock.mockResolvedValueOnce(updatedPage);
    deletePageMock.mockResolvedValueOnce(updatedPage);

    const { savePageAction, deletePageAction } = await loadCmsActions();
    await savePageAction(pageForm());
    await savePageAction(pageForm({ id: "page-1", title: "Updated Page" }));
    await deletePageAction(idForm("page-1"));

    expect(auditPayloadFor("CMS_PAGE_CREATED")).toEqual([
      expect.objectContaining({
        adminUserId: "admin-1",
        action: "CMS_PAGE_CREATED",
        targetType: "cms_page",
        targetId: "page-1",
        before: null,
        after: expect.objectContaining({ slug: "qa-audit-page", title: "QA Audit Page" }),
      }),
      transactionClient,
    ]);
    expect(auditPayloadFor("CMS_PAGE_UPDATED")).toEqual([
      expect.objectContaining({
        action: "CMS_PAGE_UPDATED",
        before: expect.objectContaining({ title: "Before Page" }),
        after: expect.objectContaining({ title: "Updated Page" }),
      }),
      transactionClient,
    ]);
    expect(auditPayloadFor("CMS_PAGE_DELETED")).toEqual([
      expect.objectContaining({
        action: "CMS_PAGE_DELETED",
        before: expect.objectContaining({ title: "Updated Page" }),
        after: null,
      }),
      transactionClient,
    ]);
  });

  it("audits CMS blog create, update, and delete without leaking sensitive fields", async () => {
    const createdPost = {
      id: "blog-1",
      slug: "qa-audit-blog",
      title: "QA Audit Blog",
      content: "Blog body",
      authorId: "admin-1",
      isPublished: true,
      publishedAt: new Date("2026-05-14T10:00:00.000Z"),
    };
    const beforePost = { ...createdPost, title: "Before Blog" };
    const updatedPost = { ...createdPost, title: "Updated Blog" };
    createBlogPostMock.mockResolvedValueOnce(createdPost);
    getBlogPostMock.mockResolvedValueOnce(beforePost);
    updateBlogPostMock.mockResolvedValueOnce(updatedPost);
    deleteBlogPostMock.mockResolvedValueOnce(updatedPost);

    const { saveBlogPostAction, deleteBlogPostAction } = await loadCmsActions();
    await saveBlogPostAction(blogForm());
    await saveBlogPostAction(blogForm({ id: "blog-1", title: "Updated Blog" }));
    await deleteBlogPostAction(idForm("blog-1"));

    const serializedAudit = JSON.stringify(createAdminAuditLogMock.mock.calls);
    expect(auditPayloadFor("CMS_BLOG_CREATED")).toEqual([
      expect.objectContaining({
        action: "CMS_BLOG_CREATED",
        targetType: "cms_blog_post",
        after: expect.objectContaining({
          title: "QA Audit Blog",
          publishedAt: "2026-05-14T10:00:00.000Z",
        }),
      }),
      transactionClient,
    ]);
    expect(auditPayloadFor("CMS_BLOG_UPDATED")).toEqual([
      expect.objectContaining({
        action: "CMS_BLOG_UPDATED",
        before: expect.objectContaining({ title: "Before Blog" }),
        after: expect.objectContaining({ title: "Updated Blog" }),
      }),
      transactionClient,
    ]);
    expect(auditPayloadFor("CMS_BLOG_DELETED")).toEqual([
      expect.objectContaining({ action: "CMS_BLOG_DELETED", after: null }),
      transactionClient,
    ]);
    expect(serializedAudit).not.toMatch(/password|token|secret/i);
  });

  it("audits CMS FAQ create, update, and delete with category metadata", async () => {
    const createdFaq = {
      id: "faq-1",
      category: "QA",
      question: "Question?",
      answer: "Answer.",
      status: "published",
      displayOrder: 2,
    };
    const beforeFaq = { ...createdFaq, question: "Before question?" };
    const updatedFaq = { ...createdFaq, question: "Updated question?" };
    createFaqItemMock.mockResolvedValueOnce(createdFaq);
    getFaqItemMock.mockResolvedValueOnce(beforeFaq);
    updateFaqItemMock.mockResolvedValueOnce(updatedFaq);
    deleteFaqItemMock.mockResolvedValueOnce(updatedFaq);

    const { saveFaqItemAction, deleteFaqItemAction } = await loadCmsActions();
    await saveFaqItemAction(faqForm());
    await saveFaqItemAction(faqForm({ id: "faq-1", question: "Updated question?" }));
    await deleteFaqItemAction(idForm("faq-1"));

    expect(auditPayloadFor("CMS_FAQ_CREATED")).toEqual([
      expect.objectContaining({
        action: "CMS_FAQ_CREATED",
        targetType: "cms_faq_item",
        targetId: "faq-1",
        after: expect.objectContaining({ question: "Question?", displayOrder: 2 }),
        meta: expect.objectContaining({ category: "QA" }),
      }),
      transactionClient,
    ]);
    expect(auditPayloadFor("CMS_FAQ_UPDATED")).toEqual([
      expect.objectContaining({
        action: "CMS_FAQ_UPDATED",
        before: expect.objectContaining({ question: "Before question?" }),
        after: expect.objectContaining({ question: "Updated question?" }),
      }),
      transactionClient,
    ]);
    expect(auditPayloadFor("CMS_FAQ_DELETED")).toEqual([
      expect.objectContaining({ action: "CMS_FAQ_DELETED", after: null }),
      transactionClient,
    ]);
  });
});
