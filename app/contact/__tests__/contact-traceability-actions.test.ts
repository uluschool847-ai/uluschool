import { beforeEach, describe, expect, it, vi } from "vitest";

const createContactLeadMock = vi.hoisted(() => vi.fn());
const getAttributionFromRequestMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const getRequestIdentifierMock = vi.hoisted(() => vi.fn());
const honeypotTriggeredMock = vi.hoisted(() => vi.fn());
const submittedTooFastMock = vi.hoisted(() => vi.fn());
const verifyTurnstileTokenMock = vi.hoisted(() => vi.fn());
const sendContactEmailMock = vi.hoisted(() => vi.fn());
const generateSubmissionReferenceIdMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/contact-lead-repository", () => ({
  createContactLead: createContactLeadMock,
}));

vi.mock("@/lib/analytics/attribution", () => ({
  getAttributionFromRequest: getAttributionFromRequestMock,
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
}));

vi.mock("@/lib/security/spam-guard", () => ({
  getRequestIdentifier: getRequestIdentifierMock,
  honeypotTriggered: honeypotTriggeredMock,
  submittedTooFast: submittedTooFastMock,
}));

vi.mock("@/lib/security/turnstile", () => ({
  verifyTurnstileToken: verifyTurnstileTokenMock,
}));

vi.mock("@/lib/services/email", () => ({
  sendContactEmail: sendContactEmailMock,
}));

vi.mock("@/lib/reference-id", () => ({
  generateSubmissionReferenceId: generateSubmissionReferenceIdMock,
}));

type ContactActionsModule = {
  submitContactEnquiry: (
    prevState: { success: boolean; message: string },
    formData: FormData,
  ) => Promise<Record<string, unknown>>;
};

async function loadContactActions() {
  const specifier = "@/app/contact/actions";
  return import(/* @vite-ignore */ specifier) as Promise<ContactActionsModule>;
}

function buildContactFormData() {
  const formData = new FormData();
  formData.set("fullName", "Amina Parent");
  formData.set("email", "amina@example.com");
  formData.set("phoneWhatsapp", "+254700000000");
  formData.set("studentGrade", "Grade 6");
  formData.set("message", "I want to know more about live classes and timetable.");
  formData.set("companyWebsite", "");
  formData.set("startedAt", "1");
  formData.set("cf-turnstile-response", "token");
  return formData;
}

describe("contact action success traceability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequestIdentifierMock.mockResolvedValue("req-1");
    checkRateLimitMock.mockReturnValue({ ok: true });
    honeypotTriggeredMock.mockReturnValue(false);
    submittedTooFastMock.mockReturnValue(false);
    verifyTurnstileTokenMock.mockResolvedValue({ ok: true });
    getAttributionFromRequestMock.mockResolvedValue({
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "brand",
      referrer: "https://example.com",
    });
    generateSubmissionReferenceIdMock.mockReturnValue("MS-2026-1001");
    createContactLeadMock.mockResolvedValue({
      id: "lead-1001",
      referenceId: "MS-2026-1001",
      createdAt: new Date("2026-05-04T09:15:00.000Z"),
    });
    sendContactEmailMock.mockResolvedValue({ delivered: true });
  });

  it("does not expose adminPath or lead database ID from the contact action", async () => {
    const { submitContactEnquiry } = await loadContactActions();
    const result = await submitContactEnquiry(
      { success: false, message: "" },
      buildContactFormData(),
    );

    expect(result).toMatchObject({
      success: true,
      referenceId: "MS-2026-1001",
      submittedAt: "2026-05-04T09:15:00.000Z",
    });
    expect(result).not.toHaveProperty("adminPath");
    expect(JSON.stringify(result)).not.toContain("lead-1001");
  });

  it("persists the generated referenceId in the contact lead record", async () => {
    const { submitContactEnquiry } = await loadContactActions();
    await submitContactEnquiry({ success: false, message: "" }, buildContactFormData());

    expect(generateSubmissionReferenceIdMock).toHaveBeenCalledWith({
      prefix: "MS",
      year: 2026,
      recordType: "contact",
    });
    expect(createContactLeadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: "Amina Parent",
        referenceId: "MS-2026-1001",
      }),
      expect.anything(),
    );
  });

  it("does not log raw contact values when persistence fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    createContactLeadMock.mockRejectedValueOnce(new Error("Amina Parent amina@example.com"));

    const { submitContactEnquiry } = await loadContactActions();
    await submitContactEnquiry({ success: false, message: "" }, buildContactFormData());

    expect(errorSpy).toHaveBeenCalledWith("Contact submission failed", {
      errorType: "Error",
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toMatch(
      /amina parent|amina@example\.com|\+254700000000|live classes/i,
    );
    errorSpy.mockRestore();
  });
});
