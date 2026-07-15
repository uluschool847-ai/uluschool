import { beforeEach, describe, expect, it, vi } from "vitest";

const createEnquiryMock = vi.hoisted(() => vi.fn());
const getAttributionFromRequestMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const getRequestIdentifierMock = vi.hoisted(() => vi.fn());
const honeypotTriggeredMock = vi.hoisted(() => vi.fn());
const submittedTooFastMock = vi.hoisted(() => vi.fn());
const verifyTurnstileTokenMock = vi.hoisted(() => vi.fn());
const sendEnquiryEmailMock = vi.hoisted(() => vi.fn());
const generateSubmissionReferenceIdMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/enquiry-repository", () => ({
  createEnquiry: createEnquiryMock,
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
  sendEnquiryEmail: sendEnquiryEmailMock,
}));

vi.mock("@/lib/reference-id", () => ({
  generateSubmissionReferenceId: generateSubmissionReferenceIdMock,
}));

type EnrolActionsModule = {
  submitEnrolment: (
    prevState: { success: boolean; message: string },
    formData: FormData,
  ) => Promise<Record<string, unknown>>;
};

async function loadEnrolActions() {
  const specifier = "@/app/enrol/actions";
  return import(/* @vite-ignore */ specifier) as Promise<EnrolActionsModule>;
}

function buildEnrolFormData() {
  const formData = new FormData();
  formData.set("studentName", "Daniel Student");
  formData.set("ageYearLevel", "Grade 6");
  formData.append("subjects", "Biology");
  formData.append("subjects", "Chemistry");
  formData.set("curriculumLevel", "grade-6");
  formData.set("parentGuardianName", "Grace Parent");
  formData.set("email", "grace@example.com");
  formData.set("phoneWhatsapp", "+254711111111");
  formData.set("preferredSchedule", "Weekdays after 4pm");
  formData.set("additionalNotes", "Interested in a trial class next week.");
  formData.set("consentAccepted", "true");
  formData.set("companyWebsite", "");
  formData.set("startedAt", "1");
  formData.set("cf-turnstile-response", "token");
  return formData;
}

describe("enrolment action success traceability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequestIdentifierMock.mockResolvedValue("req-2");
    checkRateLimitMock.mockReturnValue({ ok: true });
    honeypotTriggeredMock.mockReturnValue(false);
    submittedTooFastMock.mockReturnValue(false);
    verifyTurnstileTokenMock.mockResolvedValue({ ok: true });
    getAttributionFromRequestMock.mockResolvedValue({
      utmSource: "facebook",
      utmMedium: "paid-social",
      utmCampaign: "trial-class",
      referrer: "https://example.com",
    });
    generateSubmissionReferenceIdMock.mockReturnValue("MS-2026-2001");
    createEnquiryMock.mockResolvedValue({
      id: "enquiry-2001",
      referenceId: "MS-2026-2001",
      createdAt: new Date("2026-05-04T10:45:00.000Z"),
    });
    sendEnquiryEmailMock.mockResolvedValue({ delivered: true });
  });

  it("does not expose adminPath or enquiry database ID in public action state", async () => {
    const { submitEnrolment } = await loadEnrolActions();
    const result = await submitEnrolment({ success: false, message: "" }, buildEnrolFormData());

    expect(result).toMatchObject({
      success: true,
      referenceId: "MS-2026-2001",
      submittedAt: "2026-05-04T10:45:00.000Z",
    });
    expect(result).not.toHaveProperty("adminPath");
    expect(JSON.stringify(result)).not.toContain("enquiry-2001");
  });

  it("persists the generated referenceId in the enquiry record", async () => {
    const { submitEnrolment } = await loadEnrolActions();
    await submitEnrolment({ success: false, message: "" }, buildEnrolFormData());

    expect(generateSubmissionReferenceIdMock).toHaveBeenCalledWith({
      prefix: "MS",
      year: 2026,
      recordType: "enrolment",
    });
    expect(createEnquiryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        studentName: "Daniel Student",
        referenceId: "MS-2026-2001",
      }),
      expect.anything(),
    );
  });

  it("does not log raw enrolment values when persistence fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    createEnquiryMock.mockRejectedValueOnce(new Error("Grace Parent grace@example.com"));

    const { submitEnrolment } = await loadEnrolActions();
    await submitEnrolment({ success: false, message: "" }, buildEnrolFormData());

    expect(errorSpy).toHaveBeenCalledWith("Enrolment submission failed", {
      errorType: "Error",
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toMatch(
      /grace parent|grace@example\.com|\+254711111111|interested in a trial/i,
    );
    errorSpy.mockRestore();
  });
});
