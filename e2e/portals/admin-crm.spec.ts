import { type Page, expect, test } from "@playwright/test";

import { prisma } from "@/lib/prisma";

const ADMIN_EMAIL = "fixed.admin@uluglobalacademy.com";
const TEACHER_EMAIL = "fixed.teacher@uluglobalacademy.com";
const PARENT_EMAIL = "fixed.parent@uluglobalacademy.com";
const PASSWORD =
  process.env.E2E_PORTAL_PASSWORD ?? process.env.SEED_PORTAL_PASSWORD ?? "ChangeMe123!";

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ENQUIRY_EMAIL = `qa.crm.enrol.${RUN_ID}@example.com`;
const LEAD_EMAIL = `qa.crm.contact.${RUN_ID}@example.com`;

type CrmRecord = {
  id: string;
  referenceId: string;
};

let enquiryRecord: CrmRecord | null = null;
let leadRecord: CrmRecord | null = null;

test.describe("Admin CRM enquiries and leads", () => {
  test.describe.configure({ timeout: 420000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupQaCrmData();
  });

  test.afterAll(async () => {
    await cleanupQaCrmData();
    await prisma.$disconnect();
  });

  test("admin can manage public enrolment enquiries and contact leads end to end", async ({
    page,
  }) => {
    enquiryRecord = await submitPublicEnrolment(page);
    leadRecord = await submitPublicContactLead(page);

    await loginAs(page, ADMIN_EMAIL, /\/(admin|security)/);

    await page.goto(`/admin?search=${encodeURIComponent(enquiryRecord.referenceId)}`);
    await expect(page.getByRole("heading", { level: 1, name: "Admin Dashboard" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Enrolment Enquiries/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Contact Enquiries/ })).toBeVisible();
    await expect(
      page.getByLabel("Recent submissions").getByText(enquiryRecord.referenceId),
    ).toBeVisible();
    await expect(page.getByText(`QA CRM Student ${RUN_ID}`)).toBeVisible();

    await page.goto(`/admin?search=${encodeURIComponent(leadRecord.referenceId)}`);
    await expect(
      page.getByLabel("Contact enquiries").getByText(leadRecord.referenceId),
    ).toBeVisible();
    await expect(page.getByText(`QA CRM Lead ${RUN_ID}`)).toBeVisible();

    await page.goto("/admin?search=NO-MATCH-QA-CRM");
    await expect(page.getByText(/no matching records found/i)).toBeVisible();

    await page.goto("/admin?status=In%20Progress");
    await expect(page.getByRole("heading", { level: 1, name: "Admin Dashboard" })).toBeVisible();

    await page.goto("/admin?status=NOT_A_STATUS&page=999");
    await expect(page.getByRole("heading", { level: 1, name: "Admin Dashboard" })).toBeVisible();

    await verifyEnquiryDetailWorkflow(page, enquiryRecord);
    await verifyLeadDetailWorkflow(page, leadRecord);
    await verifyCrmListRoutes(page, enquiryRecord, leadRecord);
    await verifyNotFoundRoutes(page);
    await verifyTimelineTraceability(enquiryRecord.id, leadRecord.id);
  });

  test("teacher and parent users cannot access CRM admin routes in the browser", async ({
    page,
  }) => {
    const enquiry = await ensureEnquiryRecord();
    const lead = await ensureLeadRecord();
    const protectedRoutes = [
      "/admin",
      `/admin/enquiries/${enquiry.id}`,
      "/admin/leads",
      `/admin/leads/${lead.id}`,
      "/admin/submissions",
    ];

    for (const user of [
      {
        email: TEACHER_EMAIL,
        landingUrl: /\/portal\/teacher|\/portal\/unauthorized|\/admin\/security/,
      },
      {
        email: PARENT_EMAIL,
        landingUrl: /\/portal\/parent|\/portal\/unauthorized|\/admin\/security/,
      },
    ]) {
      await loginAs(page, user.email, user.landingUrl);

      for (const route of protectedRoutes) {
        await page.goto(route);
        await expect(page).toHaveURL(/\/portal\/unauthorized|\/portal\/login/);
      }

      await page.context().clearCookies();
    }
  });
});

async function cleanupQaCrmData() {
  const [enquiries, leads] = await Promise.all([
    prisma.enquiry.findMany({
      where: {
        OR: [
          { email: { startsWith: "qa.crm.enrol." } },
          { referenceId: { startsWith: "QA-CRM-ENROL-" } },
        ],
      },
      select: { id: true },
    }),
    prisma.contactLead.findMany({
      where: {
        OR: [
          { email: { startsWith: "qa.crm.contact." } },
          { referenceId: { startsWith: "QA-CRM-LEAD-" } },
        ],
      },
      select: { id: true },
    }),
  ]);
  await prisma.adminAuditLog.deleteMany({
    where: {
      OR: [
        {
          targetType: "Enquiry",
          targetId: { in: enquiries.map((enquiry) => enquiry.id) },
        },
        {
          targetType: "ContactLead",
          targetId: { in: leads.map((lead) => lead.id) },
        },
      ],
    },
  });
  await prisma.enquiry.deleteMany({
    where: {
      OR: [
        { email: { startsWith: "qa.crm.enrol." } },
        { referenceId: { startsWith: "QA-CRM-ENROL-" } },
      ],
    },
  });
  await prisma.contactLead.deleteMany({
    where: {
      OR: [
        { email: { startsWith: "qa.crm.contact." } },
        { referenceId: { startsWith: "QA-CRM-LEAD-" } },
      ],
    },
  });
}

async function loginAs(page: Page, email: string, landingUrl: RegExp) {
  await page.context().clearCookies();
  await page.goto("/portal/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /login|sign in/i }).click();
  await page.waitForURL(landingUrl, { timeout: 60000 });
}

async function submitPublicEnrolment(page: Page): Promise<CrmRecord> {
  await page.goto("/enrol");
  await page.locator("#parentGuardianName").fill(`QA CRM Parent ${RUN_ID}`);
  await page.locator("#email").fill(ENQUIRY_EMAIL);
  await page.locator("#phoneWhatsapp").fill("+254700111222");
  await page.getByRole("button", { name: "Next Step" }).click();
  await page.locator("#studentName").fill(`QA CRM Student ${RUN_ID}`);
  await page.locator("#ageYearLevel").fill("Year 7");
  await page.locator('select[name="curriculumLevel"]').selectOption({ index: 1 });
  await page.locator('input[name="subjects"]').first().check();
  await page.getByRole("button", { name: "Next Step" }).click();
  await page.locator("#preferredSchedule").fill("Weekday evenings");
  await page.locator("#additionalNotes").fill("QA CRM enrolment notes");
  await page.waitForTimeout(1400);
  await page.getByRole("button", { name: /submit enrolment/i }).click();
  await expect(page.getByText(/reference id/i)).toBeVisible({ timeout: 15000 });

  const enquiry = await prisma.enquiry.findFirstOrThrow({
    where: { email: ENQUIRY_EMAIL },
    orderBy: { createdAt: "desc" },
    select: { id: true, referenceId: true },
  });

  expect(enquiry.referenceId).toBeTruthy();
  expect(enquiry.referenceId).not.toBe("MS-2026-0000");
  return { id: enquiry.id, referenceId: enquiry.referenceId as string };
}

async function submitPublicContactLead(page: Page): Promise<CrmRecord> {
  await page.goto("/contact");
  await page.locator("#fullName").fill(`QA CRM Lead ${RUN_ID}`);
  await page.locator("#email").fill(LEAD_EMAIL);
  await page.locator("#phoneWhatsapp").fill("+254700333444");
  await page.locator("#studentGrade").fill("Year 9");
  await page.locator("#message").fill("QA CRM contact lead message");
  await page.waitForTimeout(1400);
  await page.getByRole("button", { name: /^submit$/i }).click();
  await expect(page.getByText(/reference id/i)).toBeVisible({ timeout: 15000 });

  const lead = await prisma.contactLead.findFirstOrThrow({
    where: { email: LEAD_EMAIL },
    orderBy: { createdAt: "desc" },
    select: { id: true, referenceId: true },
  });

  expect(lead.referenceId).toBeTruthy();
  expect(lead.referenceId).not.toBe("MS-2026-0000");
  return { id: lead.id, referenceId: lead.referenceId as string };
}

async function verifyEnquiryDetailWorkflow(page: Page, enquiry: CrmRecord) {
  const note = `QA CRM enquiry note ${RUN_ID}`;

  await page.goto(`/admin/enquiries/${enquiry.id}`);
  await expect(page.getByRole("heading", { name: `QA CRM Student ${RUN_ID}` })).toBeVisible();
  await expect(page.getByText(enquiry.referenceId)).toBeVisible();
  await page.getByRole("button", { name: /add note/i }).click();
  await expect(page.getByText(/note is required/i)).toBeVisible();

  for (const status of ["IN_PROGRESS", "CONVERTED", "REJECTED", "NEW"]) {
    await page.getByLabel(/^status$/i).selectOption(status);
    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page.getByText(/status updated/i)).toBeVisible({ timeout: 15000 });
  }

  await page.getByLabel(/^note$/i).fill(note);
  await page.getByRole("button", { name: /add note/i }).click();
  await expect(page.getByText(/note added/i)).toBeVisible({ timeout: 15000 });
  await page.reload();
  await expect(page.getByText(note)).toBeVisible();
  await expect(page.getByText(/status changed to rejected/i)).toBeVisible();
}

async function verifyLeadDetailWorkflow(page: Page, lead: CrmRecord) {
  const note = `QA CRM lead note ${RUN_ID}`;

  await page.goto(`/admin/leads/${lead.id}`);
  await expect(page.getByRole("heading", { name: `QA CRM Lead ${RUN_ID}` })).toBeVisible();
  await expect(page.getByText(lead.referenceId)).toBeVisible();
  await page.getByRole("button", { name: /add note/i }).click();
  await expect(page.getByText(/note is required/i)).toBeVisible();

  for (const status of ["IN_PROGRESS", "CONVERTED", "REJECTED"]) {
    await page.getByLabel(/^status$/i).selectOption(status);
    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page.getByText(/status updated/i)).toBeVisible({ timeout: 15000 });
  }

  await page.getByLabel(/^note$/i).fill(note);
  await page.getByRole("button", { name: /add note/i }).click();
  await expect(page.getByText(/note added/i)).toBeVisible({ timeout: 15000 });
  await page.reload();
  await expect(page.getByText(note)).toBeVisible();
}

async function verifyCrmListRoutes(page: Page, enquiry: CrmRecord, lead: CrmRecord) {
  await page.goto(`/admin/leads?search=${encodeURIComponent(lead.referenceId)}`);
  await expect(page.getByRole("heading", { name: /contact leads/i })).toBeVisible();
  const leadArticle = page.locator("article").filter({ hasText: lead.referenceId });
  await expect(leadArticle.getByRole("link", { name: /open lead details/i })).toBeVisible();

  await page.goto(`/admin/submissions?search=${encodeURIComponent(enquiry.referenceId)}&page=999`);
  await expect(page.getByRole("heading", { name: /enrolment submissions/i })).toBeVisible();
  await expect(page.getByText(enquiry.referenceId)).toBeVisible();

  await page.goto("/admin/submissions?search=NO-MATCH-QA-CRM&page=999");
  await expect(page.getByText(/no results found/i)).toBeVisible();
}

async function verifyNotFoundRoutes(page: Page) {
  await page.goto("/admin/enquiries/does-not-exist-qa");
  await expect(page.getByText(/404|not found/i)).toBeVisible();
  await page.goto("/admin/leads/does-not-exist-qa");
  await expect(page.getByText(/404|not found/i)).toBeVisible();
}

async function verifyTimelineTraceability(enquiryId: string, leadId: string) {
  const [enquiryEvents, leadEvents, adminAuditLogs] = await Promise.all([
    prisma.enquiryTimelineEvent.findMany({ where: { entityId: enquiryId } }),
    prisma.contactLeadTimelineEvent.findMany({ where: { leadId } }),
    prisma.adminAuditLog.findMany({
      where: {
        OR: [
          {
            action: { in: ["ENQUIRY_STATUS_UPDATED", "ENQUIRY_NOTE_ADDED"] },
            targetId: enquiryId,
            targetType: "Enquiry",
          },
          {
            action: { in: ["CONTACT_LEAD_STATUS_UPDATED", "CONTACT_LEAD_NOTE_ADDED"] },
            targetId: leadId,
            targetType: "ContactLead",
          },
        ],
      },
    }),
  ]);
  const serializedEvents = JSON.stringify([...enquiryEvents, ...leadEvents, ...adminAuditLogs]);

  expect(enquiryEvents.some((event) => event.type === "STATUS_CHANGED")).toBe(true);
  expect(enquiryEvents.some((event) => event.type === "NOTE_CREATED")).toBe(true);
  expect(leadEvents.some((event) => event.type === "STATUS_CHANGED")).toBe(true);
  expect(leadEvents.some((event) => event.type === "NOTE_CREATED")).toBe(true);
  expect(adminAuditLogs.some((log) => log.action === "ENQUIRY_STATUS_UPDATED")).toBe(true);
  expect(adminAuditLogs.some((log) => log.action === "ENQUIRY_NOTE_ADDED")).toBe(true);
  expect(adminAuditLogs.some((log) => log.action === "CONTACT_LEAD_STATUS_UPDATED")).toBe(true);
  expect(adminAuditLogs.some((log) => log.action === "CONTACT_LEAD_NOTE_ADDED")).toBe(true);
  expect(serializedEvents).not.toContain(`QA CRM enquiry note ${RUN_ID}`);
  expect(serializedEvents).not.toContain(`QA CRM lead note ${RUN_ID}`);
  expect(serializedEvents).not.toMatch(/password|token|secret/i);
}

async function ensureEnquiryRecord() {
  if (enquiryRecord) return enquiryRecord;

  const level = await prisma.level.findFirstOrThrow();
  const enquiry = await prisma.enquiry.create({
    data: {
      referenceId: `QA-CRM-ENROL-${RUN_ID}`,
      studentName: `QA CRM Student ${RUN_ID}`,
      ageYearLevel: "Year 7",
      subjects: ["Mathematics"],
      curriculumLevelId: level.id,
      parentGuardianName: `QA CRM Parent ${RUN_ID}`,
      email: ENQUIRY_EMAIL,
      phoneWhatsapp: "+254700111222",
      preferredSchedule: "Weekday evenings",
    },
    select: { id: true, referenceId: true },
  });
  enquiryRecord = { id: enquiry.id, referenceId: enquiry.referenceId as string };
  return enquiryRecord;
}

async function ensureLeadRecord() {
  if (leadRecord) return leadRecord;

  const lead = await prisma.contactLead.create({
    data: {
      referenceId: `QA-CRM-LEAD-${RUN_ID}`,
      fullName: `QA CRM Lead ${RUN_ID}`,
      email: LEAD_EMAIL,
      message: "QA CRM contact lead message",
    },
    select: { id: true, referenceId: true },
  });
  leadRecord = { id: lead.id, referenceId: lead.referenceId as string };
  return leadRecord;
}
