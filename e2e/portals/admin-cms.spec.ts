import { type Page, expect, test } from "@playwright/test";
import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const AUTH_SECRET = process.env.AUTH_SESSION_SECRET ?? "dev-only-auth-session-secret-please-change";
const ADMIN_EMAIL = "fixed.admin@uluglobalacademy.com";
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PAGE_SLUG = `qa-cms-page-${RUN_ID}`;
const PAGE_SLUG_EDITED = `${PAGE_SLUG}-edited`;
const BLOG_SLUG = `qa-cms-blog-${RUN_ID}`;
const BLOG_SLUG_EDITED = `${BLOG_SLUG}-edited`;
const FAQ_CATEGORY = `QA CMS ${RUN_ID}`;
let adminUserId = "";

function toBase64Url(input: string) {
  return Buffer.from(input, "binary")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function signPayload(payloadBase64: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadBase64));
  const signatureString = Array.from(new Uint8Array(signature))
    .map((byte) => String.fromCharCode(byte))
    .join("");
  return toBase64Url(signatureString);
}

async function createSessionToken(input: {
  uid: string;
  role: UserRole;
  email: string;
  fullName: string;
}) {
  const payloadBase64 = toBase64Url(
    JSON.stringify({
      uid: input.uid,
      role: input.role,
      email: input.email,
      fullName: input.fullName,
      exp: Date.now() + 1000 * 60 * 60,
      mfaVerified: true,
      authMethod: "password",
    }),
  );
  return `${payloadBase64}.${await signPayload(payloadBase64)}`;
}

async function setPortalSession(
  page: Page,
  input: {
    uid: string;
    role: UserRole;
    email: string;
    fullName: string;
  },
) {
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: "ulu_session",
      value: await createSessionToken(input),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 3600,
    },
  ]);
}

async function cleanupQaCmsData() {
  await prisma.pageContent.deleteMany({
    where: { slug: { startsWith: "qa-cms-page-" } },
  });
  await prisma.blogPost.deleteMany({
    where: { slug: { startsWith: "qa-cms-blog-" } },
  });
  await prisma.faqItem.deleteMany({
    where: { category: { startsWith: "QA CMS " } },
  });
}

test.describe("Admin CMS management", () => {
  test.describe.configure({ timeout: 180000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupQaCmsData();
    const admin = await prisma.appUser.findUniqueOrThrow({
      where: { email: ADMIN_EMAIL },
      select: { id: true },
    });
    adminUserId = admin.id;
  });

  test.afterAll(async () => {
    await cleanupQaCmsData();
    await prisma.$disconnect();
  });

  test("admin manages CMS pages, blog posts, and FAQ items end to end", async ({ page }) => {
    await setPortalSession(page, {
      uid: adminUserId,
      role: UserRole.ADMIN,
      email: ADMIN_EMAIL,
      fullName: "Fixed Admin",
    });

    await page.goto("/admin/cms");
    await expect(page.getByRole("heading", { name: /content management/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /manage pages/i })).toHaveAttribute(
      "href",
      "/admin/cms/pages",
    );
    await expect(page.getByRole("link", { name: /manage blog/i })).toHaveAttribute(
      "href",
      "/admin/cms/blog",
    );
    await expect(page.getByRole("link", { name: /manage faqs/i })).toHaveAttribute(
      "href",
      "/admin/cms/faq",
    );

    await verifyPageWorkflow(page);
    await verifyBlogWorkflow(page);
    await verifyFaqWorkflow(page);
    await verifyCmsAuditLogs();
  });

  test("guest and non-admin users cannot access CMS admin routes", async ({ page }) => {
    const [cmsPage, blogPost, faqItem] = await Promise.all([
      prisma.pageContent.create({
        data: {
          slug: `${PAGE_SLUG}-access`,
          title: "QA CMS Access Page",
          content: { blocks: [{ type: "paragraph", text: "Access fixture" }] },
          isPublished: false,
        },
      }),
      prisma.blogPost.create({
        data: {
          slug: `${BLOG_SLUG}-access`,
          title: "QA CMS Access Blog",
          content: "Access fixture",
          authorId: adminUserId,
          isPublished: false,
        },
      }),
      prisma.faqItem.create({
        data: {
          category: FAQ_CATEGORY,
          question: "QA CMS access FAQ?",
          answer: "Access fixture",
          displayOrder: 0,
        },
      }),
    ]);
    const protectedRoutes = [
      "/admin/cms",
      "/admin/cms/pages",
      `/admin/cms/pages/${cmsPage.id}`,
      "/admin/cms/blog",
      `/admin/cms/blog/${blogPost.id}`,
      "/admin/cms/faq",
      `/admin/cms/faq/${faqItem.id}`,
    ];

    await page.context().clearCookies();
    for (const route of protectedRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/portal\/login/);
    }

    for (const user of [
      {
        uid: "student-123",
        role: UserRole.STUDENT,
        email: "fixed.student@uluglobalacademy.com",
        fullName: "Fixed Student",
      },
      {
        uid: "teacher-123",
        role: UserRole.TEACHER,
        email: "fixed.teacher@uluglobalacademy.com",
        fullName: "Fixed Teacher",
      },
      {
        uid: "parent-123",
        role: UserRole.PARENT,
        email: "fixed.parent@uluglobalacademy.com",
        fullName: "Fixed Parent",
      },
    ]) {
      await setPortalSession(page, user);

      for (const route of protectedRoutes) {
        await page.goto(route);
        await expect(page).toHaveURL(/\/portal\/unauthorized|\/portal\/login/);
      }
    }
  });
});

async function verifyPageWorkflow(page: Page) {
  const title = `QA CMS Page ${RUN_ID}`;
  const editedTitle = `${title} Edited`;

  await page.goto("/admin/cms/pages");
  await expect(page.getByRole("heading", { name: "Pages", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /create new page/i })).toBeVisible();

  await page.goto("/admin/cms/pages/new");
  await expect(page.getByRole("heading", { name: /create new page/i })).toBeVisible();
  await page.locator("#title").fill("Reserved route page");
  await page.locator("#slug").fill("contact");
  await page.locator("#content").fill('{ "blocks": [] }');
  await page.getByRole("button", { name: /create page/i }).click();
  await expect(page.getByText(/static route/i)).toBeVisible();

  await page.locator("#title").fill("Invalid slug page");
  await page.locator("#slug").fill("bad_slug");
  await page.locator("#slug").evaluate((input) => input.removeAttribute("pattern"));
  await page.locator("#content").fill('{ "blocks": [] }');
  await page.getByRole("button", { name: /create page/i }).click();
  await expect(page.getByText(/invalid slug/i)).toBeVisible();

  await page.locator("#title").fill(title);
  await page.locator("#slug").fill(PAGE_SLUG);
  await page.locator("#content").fill("{ invalid json");
  await page.getByRole("button", { name: /create page/i }).click();
  await expect(page.getByText(/invalid json/i)).toBeVisible();

  await page.locator("#title").fill(title);
  await page.locator("#slug").fill(PAGE_SLUG);
  await page.locator("#content").fill(
    JSON.stringify({
      summary: "QA CMS page summary",
      blocks: [
        { type: "heading", text: "QA CMS Page Heading" },
        { type: "paragraph", text: "QA CMS page public paragraph" },
      ],
    }),
  );
  await page.locator("#isPublished").uncheck();
  await page.getByRole("button", { name: /create page/i }).click();
  await page.waitForURL(/\/admin\/cms\/pages$/);
  await expect(page.getByText(title)).toBeVisible();

  await page.goto(`/pages/${PAGE_SLUG}`);
  await expect(page.getByText(/404|not found/i)).toBeVisible();

  await page.goto("/admin/cms/pages/new");
  await page.locator("#title").fill(`${title} Duplicate`);
  await page.locator("#slug").fill(PAGE_SLUG);
  await page.locator("#content").fill('{ "blocks": [] }');
  await page.getByRole("button", { name: /create page/i }).click();
  await expect(page.getByText(/already in use/i)).toBeVisible();

  const createdPage = await prisma.pageContent.findUniqueOrThrow({ where: { slug: PAGE_SLUG } });
  await page.goto(`/admin/cms/pages/${createdPage.id}`);
  await page.locator("#title").fill(editedTitle);
  await page.locator("#slug").fill(PAGE_SLUG_EDITED);
  await page.locator("#content").fill(
    JSON.stringify({
      summary: "QA CMS edited summary",
      blocks: [{ type: "paragraph", text: "QA CMS edited public paragraph" }],
    }),
  );
  await page.locator("#isPublished").check();
  await page.getByRole("button", { name: /save changes/i }).click();
  await page.waitForURL(/\/admin\/cms\/pages$/);
  await expect(page.getByText(editedTitle)).toBeVisible();

  await page.goto(`/pages/${PAGE_SLUG_EDITED}`);
  await expect(page.getByRole("heading", { name: editedTitle })).toBeVisible();
  await expect(page.getByText("QA CMS edited public paragraph")).toBeVisible();

  await page.goto("/admin/cms/pages");
  await page
    .locator("tr", { hasText: editedTitle })
    .getByRole("button", { name: /delete/i })
    .click();
  await expect(page.getByText(editedTitle)).toHaveCount(0);
  await expect(
    prisma.pageContent.findUnique({ where: { id: createdPage.id } }),
  ).resolves.toBeNull();

  await page.goto(`/pages/${PAGE_SLUG_EDITED}`);
  await expect(page.getByText(/404|not found/i)).toBeVisible();
}

async function verifyBlogWorkflow(page: Page) {
  const title = `QA CMS Blog ${RUN_ID}`;
  const editedTitle = `${title} Edited`;

  await page.goto("/admin/cms/blog");
  await expect(page.getByRole("heading", { name: "Blog Posts", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /create new post/i })).toBeVisible();

  await page.goto("/admin/cms/blog/new");
  await page.locator("#title").fill(title);
  await page.locator("#slug").fill("bad_slug");
  await page.locator("#slug").evaluate((input) => input.removeAttribute("pattern"));
  await page.locator("#content").fill("QA CMS invalid slug post");
  await page.getByRole("button", { name: /create post/i }).click();
  await expect(page.getByText(/invalid slug/i)).toBeVisible();

  await page.locator("#title").fill(title);
  await page.locator("#slug").fill(BLOG_SLUG);
  await page.locator("#content").fill("QA CMS draft blog content");
  await page.locator("#isPublished").uncheck();
  await page.getByRole("button", { name: /create post/i }).click();
  await page.waitForURL(/\/admin\/cms\/blog$/);
  await expect(page.getByText(title)).toBeVisible();

  const draftPost = await prisma.blogPost.findUniqueOrThrow({ where: { slug: BLOG_SLUG } });
  expect(draftPost.authorId).toBeTruthy();
  expect(draftPost.isPublished).toBe(false);
  expect(draftPost.publishedAt).toBeNull();

  await page.goto(`/blog/${BLOG_SLUG}`);
  await expect(page.getByText(/404|not found/i)).toBeVisible();

  await page.goto("/admin/cms/blog/new");
  await page.locator("#title").fill(`${title} Duplicate`);
  await page.locator("#slug").fill(BLOG_SLUG);
  await page.locator("#content").fill("QA CMS duplicate blog content");
  await page.getByRole("button", { name: /create post/i }).click();
  await expect(page.getByText(/already in use/i)).toBeVisible();

  await page.goto(`/admin/cms/blog/${draftPost.id}`);
  await page.locator("#title").fill(editedTitle);
  await page.locator("#slug").fill(BLOG_SLUG_EDITED);
  await page.locator("#content").fill("QA CMS edited published blog content");
  await page.locator("#isPublished").check();
  await page.getByRole("button", { name: /save changes/i }).click();
  await page.waitForURL(/\/admin\/cms\/blog$/);
  await expect(page.getByText(editedTitle)).toBeVisible();

  const publishedPost = await prisma.blogPost.findUniqueOrThrow({ where: { id: draftPost.id } });
  expect(publishedPost.publishedAt).toBeTruthy();

  await page.goto(`/blog/${BLOG_SLUG_EDITED}`);
  await expect(page.getByRole("heading", { name: editedTitle })).toBeVisible();
  await expect(page.getByText("QA CMS edited published blog content")).toBeVisible();

  await page.goto("/admin/cms/blog");
  await page
    .locator("tr", { hasText: editedTitle })
    .getByRole("button", { name: /delete/i })
    .click();
  await expect(page.getByText(editedTitle)).toHaveCount(0);
  await expect(prisma.blogPost.findUnique({ where: { id: draftPost.id } })).resolves.toBeNull();

  await page.goto(`/blog/${BLOG_SLUG_EDITED}`);
  await expect(page.getByText(/404|not found/i)).toBeVisible();
}

async function verifyFaqWorkflow(page: Page) {
  const firstQuestion = `QA CMS first FAQ ${RUN_ID}?`;
  const secondQuestion = `QA CMS second FAQ ${RUN_ID}?`;
  const editedQuestion = `QA CMS edited FAQ ${RUN_ID}?`;

  await page.goto("/admin/cms/faq");
  await expect(page.getByRole("heading", { name: "FAQ Items", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /create new faq/i })).toBeVisible();

  await page.goto("/admin/cms/faq/new");
  await page.locator("#displayOrder").evaluate((input) => input.setAttribute("step", "any"));
  await page.locator("#displayOrder").fill("1.5");
  await page.locator("#category").fill(FAQ_CATEGORY);
  await page.locator("#question").fill(firstQuestion);
  await page.locator("#answer").fill("QA CMS invalid order answer");
  await page.getByRole("button", { name: /create faq/i }).click();
  await expect(page.getByText(/valid values/i)).toBeVisible();

  await createFaqItemThroughUi(page, firstQuestion, "QA CMS first answer", 2);
  await createFaqItemThroughUi(page, secondQuestion, "QA CMS second answer", 1);

  await page.goto("/admin/cms/faq");
  await expect(page.getByText(firstQuestion)).toBeVisible();
  await expect(page.getByText(secondQuestion)).toBeVisible();
  const faqRowsText = await page.locator("tbody tr").allTextContents();
  expect(faqRowsText.findIndex((row) => row.includes(secondQuestion))).toBeLessThan(
    faqRowsText.findIndex((row) => row.includes(firstQuestion)),
  );

  await page.goto("/contact");
  await expect(page.getByText(secondQuestion)).toBeVisible();
  await expect(page.getByText(firstQuestion)).toBeVisible();

  const firstFaq = await prisma.faqItem.findFirstOrThrow({ where: { question: firstQuestion } });
  await page.goto(`/admin/cms/faq/${firstFaq.id}`);
  await page.locator("#question").fill(editedQuestion);
  await page.locator("#answer").fill("QA CMS edited answer");
  await page.locator("#displayOrder").fill("0");
  await page.getByRole("button", { name: /save changes/i }).click();
  await page.waitForURL(/\/admin\/cms\/faq$/);
  await expect(page.getByText(editedQuestion)).toBeVisible();

  await page.goto("/contact");
  await expect(page.getByText(editedQuestion)).toBeVisible();

  await page.goto("/admin/cms/faq");
  await page
    .locator("tr", { hasText: editedQuestion })
    .getByRole("button", { name: /delete/i })
    .click();
  await expect(page.getByText(editedQuestion)).toHaveCount(0);
  await expect(prisma.faqItem.findUnique({ where: { id: firstFaq.id } })).resolves.toBeNull();
}

async function createFaqItemThroughUi(
  page: Page,
  question: string,
  answer: string,
  displayOrder: number,
) {
  await page.goto("/admin/cms/faq/new");
  await page.locator("#category").fill(FAQ_CATEGORY);
  await page.locator("#displayOrder").fill(String(displayOrder));
  await page.locator("#question").fill(question);
  await page.locator("#answer").fill(answer);
  await page.getByRole("button", { name: /create faq/i }).click();
  await page.waitForURL(/\/admin\/cms\/faq$/);
}

async function verifyCmsAuditLogs() {
  const expectedActions = [
    "CMS_PAGE_CREATED",
    "CMS_PAGE_UPDATED",
    "CMS_PAGE_DELETED",
    "CMS_BLOG_CREATED",
    "CMS_BLOG_UPDATED",
    "CMS_BLOG_DELETED",
    "CMS_FAQ_CREATED",
    "CMS_FAQ_UPDATED",
    "CMS_FAQ_DELETED",
  ];
  const recentCmsLogs = await prisma.adminAuditLog.findMany({
    where: {
      action: { in: expectedActions },
      targetType: { in: ["cms_page", "cms_blog_post", "cms_faq_item"] },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const runLogs = recentCmsLogs.filter((log) => JSON.stringify(log).includes(RUN_ID));
  const runActions = new Set(runLogs.map((log) => log.action));
  const serializedRunLogs = JSON.stringify(runLogs);

  for (const action of expectedActions) {
    expect(runActions.has(action)).toBe(true);
  }
  expect(serializedRunLogs).not.toMatch(/password|token|secret/i);
}
