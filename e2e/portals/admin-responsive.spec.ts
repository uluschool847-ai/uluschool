import { type Locator, type Page, expect, test } from "@playwright/test";
import { ClassGroupStatus, LessonStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const PASSWORD =
  process.env.E2E_PORTAL_PASSWORD ?? process.env.SEED_PORTAL_PASSWORD ?? "ChangeMe123!";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "fixed.admin@uluglobalacademy.com";
const FIXTURE_IDS = {
  classGroup: "e2e__admin-responsive__class-group",
  lesson: "e2e__admin-responsive__lesson",
  page: "e2e__admin-responsive__page",
  teacher: "e2e__admin-responsive__teacher",
} as const;
const FIXTURE_CONTENT = {
  classGroup: "E2E__ Responsive Class Group",
  lesson: "E2E__ Responsive Lesson",
  page: "E2E__ Responsive CMS Page",
  pageSlug: "e2e-admin-responsive-page",
  teacher: "E2E__ Responsive Teacher",
} as const;
const LESSONS_PATH = `/admin/classes/${FIXTURE_IDS.classGroup}/lessons`;
const LAYOUT_TOLERANCE_PX = 1;

const VIEWPORTS = [
  { name: "narrow mobile", width: 320, height: 720, expectsLocalOverflow: true },
  { name: "mobile", width: 390, height: 844, expectsLocalOverflow: true },
  { name: "desktop", width: 1440, height: 900, expectsLocalOverflow: false },
] as const;

type TableRoute = {
  name: string;
  path: string;
  heading: string;
  primaryHeader: string;
  rowText: string;
};

const TABLE_ROUTES: TableRoute[] = [
  {
    name: "Class groups",
    path: "/admin/classes",
    heading: "Class Groups",
    primaryHeader: "Group",
    rowText: FIXTURE_CONTENT.classGroup,
  },
  {
    name: "Class group lessons",
    path: LESSONS_PATH,
    heading: "Lessons",
    primaryHeader: "Title",
    rowText: FIXTURE_CONTENT.lesson,
  },
  {
    name: "CMS pages",
    path: "/admin/cms/pages",
    heading: "Pages",
    primaryHeader: "Title",
    rowText: FIXTURE_CONTENT.page,
  },
  {
    name: "Teachers",
    path: "/admin/teachers",
    heading: "Teachers",
    primaryHeader: "Teacher",
    rowText: FIXTURE_CONTENT.teacher,
  },
];

async function loginAsAdmin(page: Page) {
  await page.goto("/portal/login");
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /login|sign in/i }).click();
  await page.waitForURL(/\/(admin|security)/, { timeout: 60_000 });
}

async function cleanupResponsiveFixtures() {
  await prisma.$transaction(async (database) => {
    await database.scheduledClass.deleteMany({ where: { id: FIXTURE_IDS.lesson } });
    await database.classGroup.deleteMany({ where: { id: FIXTURE_IDS.classGroup } });
    await database.pageContent.deleteMany({ where: { id: FIXTURE_IDS.page } });
    await database.teacher.deleteMany({ where: { id: FIXTURE_IDS.teacher } });
  });
}

async function createResponsiveFixtures() {
  await cleanupResponsiveFixtures();

  await prisma.$transaction(async (database) => {
    await database.classGroup.create({
      data: {
        id: FIXTURE_IDS.classGroup,
        name: FIXTURE_CONTENT.classGroup,
        description: "Exact-ID class group fixture for responsive admin table verification.",
        status: ClassGroupStatus.ACTIVE,
        capacity: 12,
      },
    });
    await database.scheduledClass.create({
      data: {
        id: FIXTURE_IDS.lesson,
        title: FIXTURE_CONTENT.lesson,
        description: "Exact-ID lesson fixture for responsive admin table verification.",
        classGroupId: FIXTURE_IDS.classGroup,
        startAt: new Date("2030-01-15T10:00:00.000Z"),
        endAt: new Date("2030-01-15T11:00:00.000Z"),
        status: LessonStatus.SCHEDULED,
      },
    });
    await database.pageContent.create({
      data: {
        id: FIXTURE_IDS.page,
        slug: FIXTURE_CONTENT.pageSlug,
        title: FIXTURE_CONTENT.page,
        content: {
          blocks: [{ type: "paragraph", text: "Responsive admin table fixture." }],
        },
        isPublished: true,
      },
    });
    await database.teacher.create({
      data: {
        id: FIXTURE_IDS.teacher,
        fullName: FIXTURE_CONTENT.teacher,
        title: "Responsive Test Teacher",
        bio: "Exact-ID teacher fixture for responsive admin table verification.",
        displayOrder: 999,
        isActive: true,
      },
    });
  });
}

async function tabUntilFocused(page: Page, target: Locator, label: string) {
  for (let press = 0; press < 150; press += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => document.activeElement === element)) {
      return;
    }
  }

  throw new Error(`Tab navigation did not reach ${label}.`);
}

async function getOverflowDiagnostics(page: Page) {
  return page.evaluate((tolerance) => {
    const root = document.documentElement;
    const allElements: HTMLElement[] = [];
    const collectElements = (container: Document | ShadowRoot) => {
      for (const element of container.querySelectorAll<HTMLElement>("*")) {
        allElements.push(element);
        if (element.shadowRoot) {
          collectElements(element.shadowRoot);
        }
      }
    };
    const parentAcrossShadowBoundary = (element: HTMLElement) => {
      if (element.parentElement) {
        return element.parentElement;
      }
      const elementRoot = element.getRootNode();
      return elementRoot instanceof ShadowRoot ? (elementRoot.host as HTMLElement) : null;
    };
    const hasClippingAncestor = (element: HTMLElement) => {
      let parent = parentAcrossShadowBoundary(element);

      while (parent && parent !== document.body) {
        const style = window.getComputedStyle(parent);
        if (
          ["auto", "clip", "hidden", "scroll"].includes(style.overflowX) &&
          parent.scrollWidth > parent.clientWidth + tolerance
        ) {
          return true;
        }
        parent = parentAcrossShadowBoundary(parent);
      }

      return false;
    };

    collectElements(document);
    const elements = allElements
      .filter((element) => {
        const bounds = element.getBoundingClientRect();
        const exceedsViewport =
          bounds.left < -tolerance || bounds.right > root.clientWidth + tolerance;
        return exceedsViewport && !hasClippingAncestor(element);
      })
      .slice(0, 12)
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return {
          classes: Array.from(element.classList).slice(0, 8),
          clientWidth: element.clientWidth,
          left: Math.round(bounds.left),
          overflowX: style.overflowX,
          position: style.position,
          right: Math.round(bounds.right),
          scrollWidth: element.scrollWidth,
          tag: element.tagName.toLowerCase(),
          width: Math.round(bounds.width),
        };
      });

    return {
      document: {
        bodyClientWidth: document.body.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
        clientWidth: root.clientWidth,
        scrollWidth: root.scrollWidth,
      },
      elements,
    };
  }, LAYOUT_TOLERANCE_PX);
}

async function pollForNoGlobalOverflow(page: Page, routeName: string) {
  await expect
    .poll(
      async () => {
        const diagnostics = await getOverflowDiagnostics(page);
        return (
          diagnostics.document.scrollWidth <=
            diagnostics.document.clientWidth + LAYOUT_TOLERANCE_PX &&
          diagnostics.document.bodyScrollWidth <=
            diagnostics.document.bodyClientWidth + LAYOUT_TOLERANCE_PX &&
          diagnostics.elements.length === 0
        );
      },
      { message: `${routeName} must not create global horizontal overflow.` },
    )
    .toBe(true);
}

async function expectNoGlobalOverflow(page: Page, routeName: string) {
  try {
    await pollForNoGlobalOverflow(page, routeName);
  } catch (error) {
    const diagnostics = await getOverflowDiagnostics(page);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\nOverflow diagnostics: ${JSON.stringify(diagnostics)}`);
  }
}

async function expectSingleLineHeaderBrand(page: Page, routeName: string) {
  const logoText = page
    .getByRole("link", { name: "ULU Online School Home" })
    .getByText("ULU Online School", { exact: true });
  const metrics = await logoText.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const lineHeight = Number.parseFloat(window.getComputedStyle(element).lineHeight);

    return {
      height: bounds.height,
      lineHeight,
    };
  });

  expect(metrics.height, `${routeName} header brand must remain on one line.`).toBeLessThanOrEqual(
    metrics.lineHeight + LAYOUT_TOLERANCE_PX,
  );
}

async function verifyTableLayout(
  page: Page,
  route: TableRoute,
  viewport: (typeof VIEWPORTS)[number],
) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  const response = await page.goto(route.path);
  expect(response?.status(), `${route.path} must load without a server error.`).toBeLessThan(500);
  await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();

  const table = page.getByRole("table");
  expect(await table.count(), `${route.name} requires non-empty fixed seeded data.`).toBe(1);
  await expect(table, `${route.name} requires non-empty fixed seeded data.`).toBeVisible();
  const fixtureRow = table.locator("tbody tr").filter({ hasText: route.rowText });
  expect(await fixtureRow.count(), `${route.name} must render its exact-ID fixture.`).toBe(1);

  const scroller = table.locator("..");
  await expect(scroller).toHaveClass(/overflow-x-auto/);

  await expectNoGlobalOverflow(page, route.name);
  await expectSingleLineHeaderBrand(page, route.name);

  const initialScrollerMetrics = await scroller.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollLeft: element.scrollLeft,
    scrollWidth: element.scrollWidth,
  }));
  expect(initialScrollerMetrics.clientWidth).toBeGreaterThan(0);
  expect(initialScrollerMetrics.scrollLeft).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
  if (viewport.expectsLocalOverflow) {
    expect(initialScrollerMetrics.scrollWidth).toBeGreaterThan(initialScrollerMetrics.clientWidth);
  } else {
    expect(initialScrollerMetrics.scrollWidth).toBeLessThanOrEqual(
      initialScrollerMetrics.clientWidth + LAYOUT_TOLERANCE_PX,
    );
  }

  await expect(table.getByRole("columnheader", { name: route.primaryHeader })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Status" })).toBeVisible();

  const headers = await table.getByRole("columnheader").allTextContents();
  const statusColumnIndex = headers.findIndex((header) => header.trim() === "Status");
  expect(statusColumnIndex, `${route.name} must expose a Status column.`).toBeGreaterThanOrEqual(0);
  const actionsColumnIndex = headers.findIndex((header) => header.trim() === "Actions");
  expect(actionsColumnIndex, `${route.name} must expose an Actions column.`).toBeGreaterThanOrEqual(
    0,
  );

  const primaryCell = fixtureRow.getByRole("cell").first();
  expect((await primaryCell.innerText()).trim()).not.toBe("");
  const statusCell = fixtureRow.getByRole("cell").nth(statusColumnIndex);
  expect((await statusCell.innerText()).trim()).not.toBe("");

  const actionCell = fixtureRow.getByRole("cell").nth(actionsColumnIndex);
  const action = actionCell.locator("a[href], button:not([disabled])").first();
  expect(await action.count(), `${route.name} fixture must expose an action.`).toBe(1);

  await tabUntilFocused(page, action, `${route.name} row action`);

  await expect(action).toBeFocused();
  const actionViewport = await action.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      bottom: bounds.bottom,
      left: bounds.left,
      right: bounds.right,
      top: bounds.top,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
  });
  expect(actionViewport.left).toBeGreaterThanOrEqual(-LAYOUT_TOLERANCE_PX);
  expect(actionViewport.right).toBeLessThanOrEqual(
    actionViewport.viewportWidth + LAYOUT_TOLERANCE_PX,
  );
  expect(actionViewport.top).toBeGreaterThanOrEqual(-LAYOUT_TOLERANCE_PX);
  expect(actionViewport.bottom).toBeLessThanOrEqual(
    actionViewport.viewportHeight + LAYOUT_TOLERANCE_PX,
  );

  const finalScrollLeft = await scroller.evaluate((element) => element.scrollLeft);
  if (viewport.expectsLocalOverflow) {
    expect(finalScrollLeft).toBeGreaterThan(
      initialScrollerMetrics.scrollLeft + LAYOUT_TOLERANCE_PX,
    );
  } else {
    expect(finalScrollLeft).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
  }
}

test.describe("Responsive admin tables", () => {
  test.beforeAll(async () => {
    await createResponsiveFixtures();
  });

  test.afterAll(async () => {
    await cleanupResponsiveFixtures();
    await prisma.$disconnect();
  });

  for (const route of TABLE_ROUTES) {
    for (const viewport of VIEWPORTS) {
      test(`${route.name} remains usable at ${viewport.name} size`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await loginAsAdmin(page);
        await verifyTableLayout(page, route, viewport);
      });
    }
  }
});
