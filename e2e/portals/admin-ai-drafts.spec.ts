import { type Page, expect, test } from "@playwright/test";
import { AiDraftStatus, AiDraftType, UserRole } from "@prisma/client";

import { createSessionToken } from "@/e2e/helpers/session";
import { prisma } from "@/lib/prisma";
const ADMIN_EMAIL = "fixed.admin@uluglobalacademy.com";
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ENQUIRY_EMAIL = `qa.ai-drafts.${RUN_ID}@example.com`;
const ENQUIRY_REFERENCE = `QA-AI-DRAFT-${RUN_ID}`;
const REJECT_DRAFT_TEXT = `QA AI reject draft ${RUN_ID}`;

let adminUserId = "";
let enquiryId = "";
let rejectDraftId = "";

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

async function cleanupQaAiDraftsData() {
  const enquiries = await prisma.enquiry.findMany({
    where: {
      OR: [
        { email: { startsWith: "qa.ai-drafts." } },
        { referenceId: { startsWith: "QA-AI-DRAFT-" } },
      ],
    },
    select: { id: true },
  });
  const enquiryIds = enquiries.map((enquiry) => enquiry.id);
  const drafts = await prisma.aiDraft.findMany({
    where: {
      OR: [
        { relatedEnquiryId: { in: enquiryIds } },
        { outputText: { startsWith: "QA AI reject draft" } },
      ],
    },
    select: { id: true },
  });
  const draftIds = drafts.map((draft) => draft.id);

  if (draftIds.length > 0) {
    await prisma.adminAuditLog.deleteMany({
      where: {
        targetType: "ai_draft",
        targetId: { in: draftIds },
      },
    });
  }

  await prisma.aiDraft.deleteMany({
    where: {
      OR: [
        { relatedEnquiryId: { in: enquiryIds } },
        { outputText: { startsWith: "QA AI reject draft" } },
      ],
    },
  });
  await prisma.enquiry.deleteMany({
    where: {
      OR: [
        { email: { startsWith: "qa.ai-drafts." } },
        { referenceId: { startsWith: "QA-AI-DRAFT-" } },
      ],
    },
  });
}

async function createAiDraftFixtures() {
  const [admin, level] = await Promise.all([
    prisma.appUser.findUniqueOrThrow({
      where: { email: ADMIN_EMAIL },
      select: { id: true },
    }),
    prisma.level.findFirstOrThrow({ select: { id: true } }),
  ]);
  adminUserId = admin.id;

  const enquiry = await prisma.enquiry.create({
    data: {
      ageYearLevel: "Year 8",
      curriculumLevelId: level.id,
      email: ENQUIRY_EMAIL,
      parentGuardianName: `QA AI Parent ${RUN_ID}`,
      phoneWhatsapp: "+254700555666",
      preferredSchedule: "Weekday afternoons",
      referenceId: ENQUIRY_REFERENCE,
      studentName: `QA AI Student ${RUN_ID}`,
      subjects: ["Mathematics"],
    },
    select: { id: true },
  });
  enquiryId = enquiry.id;

  const rejectDraft = await prisma.aiDraft.create({
    data: {
      createdById: admin.id,
      inputSnapshot: { enquiryId: enquiry.id },
      outputText: REJECT_DRAFT_TEXT,
      relatedEnquiryId: enquiry.id,
      status: AiDraftStatus.DRAFT,
      type: AiDraftType.CRM_FOLLOW_UP,
    },
    select: { id: true },
  });
  rejectDraftId = rejectDraft.id;
}

function draftArticle(page: Page, text: string) {
  return page.locator("article").filter({ hasText: text });
}

test.describe("Admin AI Drafts", () => {
  test.describe.configure({ timeout: 180000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupQaAiDraftsData();
    await createAiDraftFixtures();
  });

  test.afterAll(async () => {
    await cleanupQaAiDraftsData();
    await prisma.$disconnect();
  });

  test("admin generates, approves, rejects, and audits AI drafts through the UI", async ({
    page,
  }) => {
    await setPortalSession(page, {
      uid: adminUserId,
      role: UserRole.ADMIN,
      email: ADMIN_EMAIL,
      fullName: "Fixed Admin",
    });

    await page.goto("/admin/ai-drafts");
    await expect(page.getByRole("heading", { name: "AI Draft Assistant" })).toBeVisible();

    const failedAuditCount = await prisma.adminAuditLog.count({
      where: { action: "AI_DRAFT_CREATED", targetType: "ai_draft" },
    });
    await page.getByLabel("Enquiry ID").fill("missing-ai-draft-enquiry");
    await page.getByRole("button", { name: "Generate CRM draft" }).click();
    await expect(page.getByText("Enquiry not found.")).toBeVisible({ timeout: 15000 });
    await expect(
      prisma.adminAuditLog.count({
        where: { action: "AI_DRAFT_CREATED", targetType: "ai_draft" },
      }),
    ).resolves.toBe(failedAuditCount);

    await page.getByLabel("Enquiry ID").fill(enquiryId);
    await page.getByRole("button", { name: "Generate CRM draft" }).click();
    await expect(page.getByText("CRM draft generated.")).toBeVisible({ timeout: 15000 });

    const generatedDraft = await prisma.aiDraft.findFirstOrThrow({
      where: {
        createdById: adminUserId,
        relatedEnquiryId: enquiryId,
        outputText: { not: REJECT_DRAFT_TEXT },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, outputText: true },
    });

    await expect(draftArticle(page, generatedDraft.outputText)).toBeVisible();
    await draftArticle(page, generatedDraft.outputText)
      .getByRole("button", { name: "Approve draft" })
      .click();
    await expect(page.getByText("AI draft approved.")).toBeVisible({ timeout: 15000 });
    await expect
      .poll(async () => {
        const draft = await prisma.aiDraft.findUnique({
          where: { id: generatedDraft.id },
          select: { status: true },
        });
        return draft?.status;
      })
      .toBe(AiDraftStatus.APPROVED);

    await page.reload();
    await expect(
      draftArticle(page, generatedDraft.outputText).getByText("Status: APPROVED"),
    ).toBeVisible();
    await expect(
      draftArticle(page, generatedDraft.outputText).getByRole("button", { name: "Approve draft" }),
    ).toHaveCount(0);

    await expect(draftArticle(page, REJECT_DRAFT_TEXT)).toBeVisible();
    await draftArticle(page, REJECT_DRAFT_TEXT)
      .getByRole("button", { name: "Reject draft" })
      .click();
    await expect(page.getByText("AI draft rejected.")).toBeVisible({ timeout: 15000 });
    await expect
      .poll(async () => {
        const draft = await prisma.aiDraft.findUnique({
          where: { id: rejectDraftId },
          select: { status: true },
        });
        return draft?.status;
      })
      .toBe(AiDraftStatus.REJECTED);

    const auditLogs = await prisma.adminAuditLog.findMany({
      where: {
        targetType: "ai_draft",
        targetId: { in: [generatedDraft.id, rejectDraftId] },
        action: { in: ["AI_DRAFT_CREATED", "AI_DRAFT_REVIEWED"] },
      },
    });
    const serializedLogs = JSON.stringify(auditLogs);
    expect(auditLogs.some((log) => log.action === "AI_DRAFT_CREATED")).toBe(true);
    expect(auditLogs.filter((log) => log.action === "AI_DRAFT_REVIEWED")).toHaveLength(2);
    expect(serializedLogs).not.toMatch(/password|token|secret/i);
  });
});
