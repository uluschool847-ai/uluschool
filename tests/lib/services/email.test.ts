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

const HTML_PAYLOAD = `<img src=x onerror="alert(1)"> & Guardian`;
const SCRIPT_MESSAGE = "First line\n<script>steal()</script>";
const MIXED_NEWLINE_MESSAGE = "CRLF\r\nLone CR\rLone LF\n<script>steal()</script>";
const HEADER_PAYLOAD = `Student\r\nBcc: attacker@example.com${"x".repeat(250)}`;

type StructuredAddress = {
  name: string;
  address: string;
};

type SentMessage = {
  from: StructuredAddress;
  to: StructuredAddress;
  replyTo: StructuredAddress;
  subject: string;
  text: string;
  html: string;
};

function configureSmtp() {
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = "1025";
  process.env.SMTP_USER = "local-user";
  process.env.SMTP_PASS = "local-pass";
  process.env.SMTP_SECURE = "false";
  sendMailMock.mockResolvedValue({});
}

function sentMessage(): SentMessage {
  return sendMailMock.mock.calls.at(-1)?.[0] as SentMessage;
}

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
        from: {
          name: "ULU Online School",
          address: "no-reply@uluglobalacademy.com",
        },
        to: { name: "", address: "info@uluglobalacademy.com" },
        replyTo: { name: "", address: ENROL_PAYLOAD.email },
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

  it("logs exactly UnknownError without a sensitive non-Error rejection or payload", async () => {
    configureSmtp();
    process.env.SMTP_MAX_RETRIES = "1";
    const sensitiveRejection = {
      secret: "synthetic-private-rejection",
      payload: CONTACT_PAYLOAD,
    };
    sendMailMock.mockRejectedValueOnce(sensitiveRejection);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { sendContactEmail } = await import("../../../lib/services/email");
    const result = await sendContactEmail(CONTACT_PAYLOAD);

    expect(result).toEqual({ delivered: false, reason: "SEND_FAILED", attempts: 1 });
    expect(errorSpy.mock.calls).toEqual([["Email delivery failed", { errorType: "UnknownError" }]]);
    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).not.toContain(sensitiveRejection.secret);
    expect(logged).not.toContain(CONTACT_PAYLOAD.email);
    expect(logged).not.toContain(CONTACT_PAYLOAD.message);
  });

  it("escapes every enrolment HTML field while preserving plain text", async () => {
    configureSmtp();
    const payload = {
      ...ENROL_PAYLOAD,
      studentName: `${"😀".repeat(205)}\r\nBcc: attacker@example.com ${HTML_PAYLOAD}`,
      ageYearLevel: HTML_PAYLOAD,
      subjects: [HTML_PAYLOAD, "Math & Science"],
      curriculumLevel: HTML_PAYLOAD,
      parentGuardianName: HTML_PAYLOAD,
      phoneWhatsapp: HTML_PAYLOAD,
      preferredSchedule: HTML_PAYLOAD,
      additionalNotes: SCRIPT_MESSAGE,
    };

    const { sendEnquiryEmail } = await import("../../../lib/services/email");
    await sendEnquiryEmail(payload);

    const message = sentMessage();
    expect(message.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; Guardian");
    expect(message.html).toContain("Math &amp; Science");
    expect(message.html).toContain("&lt;script&gt;steal()&lt;/script&gt;");
    expect(message.html).not.toMatch(/<img|<script>/i);
    expect(message.text).toContain(HTML_PAYLOAD);
    expect(message.text).toContain(SCRIPT_MESSAGE);
    expect(message.subject).not.toMatch(/[\r\n]/);
    expect(Array.from(message.subject)).toHaveLength(200);
    expect(message.to).toEqual({ name: "", address: "info@uluglobalacademy.com" });
    expect(message.replyTo).toEqual({ name: "", address: ENROL_PAYLOAD.email });
  });

  it("escapes contact HTML before converting CRLF, lone CR, and LF to one break each", async () => {
    configureSmtp();
    const payload = {
      ...CONTACT_PAYLOAD,
      fullName: `${HEADER_PAYLOAD} ${HTML_PAYLOAD}`,
      phoneWhatsapp: HTML_PAYLOAD,
      studentGrade: HTML_PAYLOAD,
      message: MIXED_NEWLINE_MESSAGE,
    };

    const { sendContactEmail } = await import("../../../lib/services/email");
    await sendContactEmail(payload);

    const message = sentMessage();
    expect(message.html).toContain(
      "CRLF<br/>Lone CR<br/>Lone LF<br/>&lt;script&gt;steal()&lt;/script&gt;",
    );
    expect(message.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; Guardian");
    expect(message.html).not.toMatch(/<img|<script>/i);
    expect(message.text).toContain(MIXED_NEWLINE_MESSAGE);
    expect(message.subject).not.toMatch(/[\r\n]/);
    expect(Array.from(message.subject).length).toBeLessThanOrEqual(200);
    expect(message.to).toEqual({ name: "", address: "info@uluglobalacademy.com" });
    expect(message.replyTo).toEqual({ name: "", address: CONTACT_PAYLOAD.email });
  });

  it("escapes class reminder names, titles, dates, and validated or fallback link content", async () => {
    configureSmtp();
    vi.spyOn(Intl.DateTimeFormat.prototype, "format", "get").mockReturnValue(() => HTML_PAYLOAD);

    const { sendClassReminderEmail } = await import("../../../lib/services/email");
    await sendClassReminderEmail({
      recipientEmail: "student@example.com",
      recipientName: HTML_PAYLOAD,
      classTitle: `${HEADER_PAYLOAD} ${HTML_PAYLOAD}`,
      startAt: new Date("2026-07-15T08:00:00.000Z"),
      endAt: new Date("2026-07-15T09:00:00.000Z"),
      liveLessonUrl: HTML_PAYLOAD,
    });

    const fallbackMessage = sentMessage();
    expect(fallbackMessage.html).toContain(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; Guardian",
    );
    expect(fallbackMessage.html).not.toMatch(/<img|<script>/i);
    expect(fallbackMessage.text).toContain(HTML_PAYLOAD);
    expect(fallbackMessage.subject).not.toMatch(/[\r\n]/);
    expect(Array.from(fallbackMessage.subject).length).toBeLessThanOrEqual(200);
    expect(fallbackMessage.to).toEqual({ name: "", address: "student@example.com" });
    expect(fallbackMessage.replyTo).toEqual({
      name: "",
      address: "info@uluglobalacademy.com",
    });

    await sendClassReminderEmail({
      recipientEmail: "student@example.com",
      recipientName: "Student",
      classTitle: "Mathematics",
      startAt: new Date("2026-07-15T08:00:00.000Z"),
      endAt: new Date("2026-07-15T09:00:00.000Z"),
      liveLessonUrl: "https://example.com/live?one=1&two=2",
    });

    expect(sentMessage().html).toContain(`href="https://example.com/live?one=1&amp;two=2"`);
    expect(sentMessage().to).toEqual({ name: "", address: "student@example.com" });
  });

  it("escapes assignment reminder names, titles, dates, and generated URL attributes", async () => {
    configureSmtp();
    vi.spyOn(Intl.DateTimeFormat.prototype, "format", "get").mockReturnValue(() => HTML_PAYLOAD);

    const { sendAssignmentReminderEmail } = await import("../../../lib/services/email");
    await sendAssignmentReminderEmail({
      recipientEmail: "student@example.com",
      recipientName: HTML_PAYLOAD,
      assignmentTitle: `${HEADER_PAYLOAD} ${HTML_PAYLOAD}`,
      dueDate: new Date("2026-07-14T08:00:00.000Z"),
      assignmentHref: "https://school.example.com/assignment?one=1&two=2",
    });

    const message = sentMessage();
    expect(message.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; Guardian");
    expect(message.html).toContain(`href="https://school.example.com/assignment?one=1&amp;two=2"`);
    expect(message.html).not.toMatch(/<img|<script>/i);
    expect(message.text).toContain(HTML_PAYLOAD);
    expect(message.text).toContain("https://school.example.com/assignment?one=1&two=2");
    expect(message.subject).not.toMatch(/[\r\n]/);
    expect(Array.from(message.subject).length).toBeLessThanOrEqual(200);
    expect(message.to).toEqual({ name: "", address: "student@example.com" });
    expect(message.replyTo).toEqual({
      name: "",
      address: "info@uluglobalacademy.com",
    });
  });

  it("uses structured sender and exact mailbox objects for configured valid addresses", async () => {
    configureSmtp();
    process.env.SMTP_FROM = "Admissions Team <admissions@example.com>";
    process.env.SCHOOL_INBOX_EMAIL = "inbox@example.com";

    const { sendContactEmail } = await import("../../../lib/services/email");
    const result = await sendContactEmail(CONTACT_PAYLOAD);

    expect(result).toEqual({ delivered: true, attempts: 1 });
    const message = sentMessage();
    expect(message.from).toEqual({ name: "Admissions Team", address: "admissions@example.com" });
    expect(message.to).toEqual({ name: "", address: "inbox@example.com" });
    expect(message.replyTo).toEqual({ name: "", address: CONTACT_PAYLOAD.email });
  });

  it("fails closed without retrying or sending for every invalid dynamic mailbox caller", async () => {
    configureSmtp();
    const overLengthMailbox = `${"a".repeat(243)}@example.com`;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const {
      sendAssignmentReminderEmail,
      sendClassReminderEmail,
      sendContactEmail,
      sendEnquiryEmail,
    } = await import("../../../lib/services/email");

    const results = [
      await sendEnquiryEmail({
        ...ENROL_PAYLOAD,
        email: "victim@example.com\r\nBcc: attacker@example.com",
      }),
      await sendContactEmail({ ...CONTACT_PAYLOAD, email: "" }),
      await sendClassReminderEmail({
        recipientEmail: "not-an-email",
        recipientName: "Student",
        classTitle: "Mathematics",
        startAt: new Date("2026-07-15T08:00:00.000Z"),
        endAt: new Date("2026-07-15T09:00:00.000Z"),
        liveLessonUrl: "https://example.com/live",
      }),
      await sendAssignmentReminderEmail({
        recipientEmail: overLengthMailbox,
        recipientName: "Student",
        assignmentTitle: "Algebra",
        dueDate: new Date("2026-07-14T08:00:00.000Z"),
        assignmentHref: "https://school.example.com/assignment",
      }),
    ];

    expect(results).toEqual(
      Array.from({ length: 4 }, () => ({
        delivered: false,
        reason: "SEND_FAILED",
        attempts: 0,
      })),
    );
    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("fails closed for injected sender or school mailbox configuration", async () => {
    configureSmtp();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { sendContactEmail } = await import("../../../lib/services/email");

    process.env.SMTP_FROM =
      "ULU Online School <no-reply@uluglobalacademy.com>\r\nBcc: attacker@example.com";
    const senderResult = await sendContactEmail(CONTACT_PAYLOAD);

    process.env.SMTP_FROM = "ULU Online School <no-reply@uluglobalacademy.com>";
    process.env.SCHOOL_INBOX_EMAIL = "Staff: victim@example.com;";
    const inboxResult = await sendContactEmail(CONTACT_PAYLOAD);

    expect(senderResult).toEqual({ delivered: false, reason: "SEND_FAILED", attempts: 0 });
    expect(inboxResult).toEqual({ delivered: false, reason: "SEND_FAILED", attempts: 0 });
    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
