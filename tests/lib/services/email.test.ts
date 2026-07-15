import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMailMock = vi.hoisted(() => vi.fn());
const createTransportMock = vi.hoisted(() =>
  vi.fn(() => ({
    sendMail: sendMailMock,
  })),
);

vi.mock("nodemailer", () => ({
  default: {
    createTransport: createTransportMock,
  },
  createTransport: createTransportMock,
}));

const CONTACT_PAYLOAD = {
  fullName: "Parent Contact",
  email: "parent@example.com",
  phoneWhatsapp: "+254700000000",
  studentGrade: "Year 9",
  message: "I want to know more.",
};

const ENROL_PAYLOAD = {
  studentName: "Student A",
  ageYearLevel: "Year 10",
  subjects: ["Mathematics", "Physics"],
  curriculumLevel: "IGCSE",
  parentGuardianName: "Guardian A",
  email: "guardian@example.com",
  phoneWhatsapp: "+254711111111",
  preferredSchedule: "Weekday evenings",
  additionalNotes: "Needs scholarship details",
  consentAccepted: true,
};

const SMTP_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_SECURE",
  "SMTP_FROM",
  "SCHOOL_INBOX_EMAIL",
  "SMTP_MAX_RETRIES",
  "EMAIL_USER",
  "EMAIL_PASS",
] as const;

function resetSmtpEnv() {
  for (const key of SMTP_KEYS) {
    delete process.env[key];
  }
}

describe("lib/services/email.ts env handling", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resetSmtpEnv();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetSmtpEnv();
  });

  it("returns SMTP_NOT_CONFIGURED and does not call nodemailer when SMTP config is missing", async () => {
    const { sendContactEmail } = await import("../../../lib/services/email");

    const result = await sendContactEmail(CONTACT_PAYLOAD);

    expect(result).toEqual({
      delivered: false,
      reason: "SMTP_NOT_CONFIGURED",
      attempts: 0,
    });
    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("uses SMTP config and default from/to addresses when explicit addresses are not set", async () => {
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = "1025";
    process.env.SMTP_USER = "local-user";
    process.env.SMTP_PASS = "local-pass";
    process.env.SMTP_SECURE = "false";

    sendMailMock.mockResolvedValueOnce({});

    const { sendEnquiryEmail } = await import("../../../lib/services/email");
    const result = await sendEnquiryEmail(ENROL_PAYLOAD);

    expect(result).toEqual({
      delivered: true,
      attempts: 1,
    });
    expect(createTransportMock).toHaveBeenCalledWith({
      host: "127.0.0.1",
      port: 1025,
      secure: false,
      auth: {
        user: "local-user",
        pass: "local-pass",
      },
    });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "ULU Online School <no-reply@uluglobalacademy.com>",
        to: "info@uluglobalacademy.com",
        replyTo: ENROL_PAYLOAD.email,
      }),
    );
  });

  it("falls back to EMAIL_USER/EMAIL_PASS when SMTP_* is not provided", async () => {
    process.env.EMAIL_USER = "legacy-user@gmail.com";
    process.env.EMAIL_PASS = "legacy-app-password";

    sendMailMock.mockResolvedValueOnce({});

    const { sendContactEmail } = await import("../../../lib/services/email");
    const result = await sendContactEmail(CONTACT_PAYLOAD);

    expect(result).toEqual({
      delivered: true,
      attempts: 1,
    });
    expect(createTransportMock).toHaveBeenCalledWith({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: "legacy-user@gmail.com",
        pass: "legacy-app-password",
      },
    });
  });

  it("logs only an allowlisted classification when SMTP delivery fails", async () => {
    const smtpUser = "smtp-private-user";
    const smtpPassword = "smtp-private-password";
    const schoolInbox = "private-school-inbox@example.com";
    const privatePayload = {
      ...CONTACT_PAYLOAD,
      fullName: "Private Parent Name",
      email: "private-parent@example.com",
      phoneWhatsapp: "+254799999999",
      message: "Private family notes",
    };
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = "1025";
    process.env.SMTP_USER = smtpUser;
    process.env.SMTP_PASS = smtpPassword;
    process.env.SCHOOL_INBOX_EMAIL = schoolInbox;
    process.env.SMTP_MAX_RETRIES = "1";
    sendMailMock.mockRejectedValueOnce(
      Object.assign(
        new Error(
          `${smtpUser} ${smtpPassword} ${schoolInbox} ${privatePayload.email} ${privatePayload.message}`,
        ),
        {
          name: "PrivateSmtpAuthenticationFailure",
          recipient: privatePayload.email,
          response: privatePayload.phoneWhatsapp,
        },
      ),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { sendContactEmail } = await import("../../../lib/services/email");
    const result = await sendContactEmail(privatePayload);

    expect(result).toEqual({ delivered: false, reason: "SEND_FAILED", attempts: 1 });
    expect(errorSpy.mock.calls).toEqual([["Email delivery failed", { errorType: "Error" }]]);
    const logged = JSON.stringify(errorSpy.mock.calls);
    for (const privateValue of [
      smtpUser,
      smtpPassword,
      schoolInbox,
      privatePayload.fullName,
      privatePayload.email,
      privatePayload.phoneWhatsapp,
      privatePayload.message,
      "PrivateSmtpAuthenticationFailure",
    ]) {
      expect(logged).not.toContain(privateValue);
    }
  });
});
