import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
const ROOT = process.cwd();
const REMINDER_RENDERER_SOURCE = `
import { once } from "node:events";
import { createServer } from "node:net";
import { pathToFileURL } from "node:url";

const messages = [];
const server = createServer((socket) => {
  let buffer = "";
  let collectingMessage = false;
  let messageLines = [];

  socket.setEncoding("utf8");
  socket.write("220 local reminder renderer\\r\\n");
  socket.on("data", (chunk) => {
    buffer += chunk;

    while (true) {
      const lineEnd = buffer.indexOf("\\r\\n");
      if (lineEnd < 0) return;

      const line = buffer.slice(0, lineEnd);
      buffer = buffer.slice(lineEnd + 2);

      if (collectingMessage) {
        if (line === ".") {
          messages.push(messageLines.join("\\n"));
          messageLines = [];
          collectingMessage = false;
          socket.write("250 queued\\r\\n");
        } else {
          messageLines.push(line);
        }
        continue;
      }

      if (/^(?:EHLO|HELO)\\s/i.test(line)) {
        socket.write("250-localhost\\r\\n250 OK\\r\\n");
      } else if (/^(?:MAIL FROM|RCPT TO):/i.test(line)) {
        socket.write("250 OK\\r\\n");
      } else if (line === "DATA") {
        collectingMessage = true;
        socket.write("354 End data with <CR><LF>.<CR><LF>\\r\\n");
      } else if (line === "QUIT") {
        socket.end("221 Bye\\r\\n");
      } else {
        socket.write("250 OK\\r\\n");
      }
    }
  });
});

server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw new Error("Local SMTP server did not bind a port");

Object.assign(process.env, {
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: String(address.port),
  SMTP_USER: "local-user",
  SMTP_PASS: "local-pass",
  SMTP_SECURE: "false",
  SMTP_MAX_RETRIES: "1",
});

const { sendAssignmentReminderEmail, sendClassReminderEmail } = await import(
  pathToFileURL(process.env.EMAIL_SERVICE_PATH ?? "").href,
);

await sendClassReminderEmail({
  recipientEmail: "student@example.com",
  recipientName: "Student",
  classTitle: "Mathematics",
  startAt: new Date("2026-07-15T08:00:00.000Z"),
  endAt: new Date("2026-07-15T09:30:00.000Z"),
  liveLessonUrl: "https://meet.google.com/abc-defg-hij",
});
await sendAssignmentReminderEmail({
  recipientEmail: "student@example.com",
  recipientName: "Student",
  assignmentTitle: "Algebra",
  dueDate: new Date("2026-07-16T10:15:00.000Z"),
  assignmentHref: "https://school.example.com/assignment",
});

await new Promise((resolve) => server.close(resolve));
process.stdout.write(
  JSON.stringify(
    messages.map((message) =>
      message
        .split("\\n")
        .filter((line) => /^(?:Start|End|Due):/.test(line)),
    ),
  ),
);
`;

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

function boundedRendererDiagnostic(value: unknown) {
  const raw =
    value instanceof Error
      ? `${value.name}: ${value.message}`
      : Buffer.isBuffer(value)
        ? value.toString("utf8")
        : String(value ?? "");
  const normalized = raw.trim().replace(/\s+/g, " ");

  return normalized.length <= 500 ? normalized : `${normalized.slice(0, 500)}... [truncated]`;
}

function assertReminderRendererSucceeded(result: ReturnType<typeof spawnSync>) {
  const stderr = boundedRendererDiagnostic(result.stderr);

  if (result.error) {
    throw new Error(
      `Reminder timezone renderer failed to start: ${boundedRendererDiagnostic(result.error)}`,
    );
  }

  if (result.status !== 0) {
    throw new Error(
      `Reminder timezone renderer exited with status ${String(result.status)}; stderr: ${stderr || "(empty)"}`,
    );
  }

  if (stderr !== "") {
    throw new Error(`Reminder timezone renderer wrote to stderr: ${stderr}`);
  }
}

function renderReminderDateLines(timeZone: string, spawn = spawnSync) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "ulu-email-timezone-"));
  const rendererPath = join(temporaryDirectory, "render-reminders.mts");

  try {
    writeFileSync(rendererPath, REMINDER_RENDERER_SOURCE);
    const result = spawn(
      process.execPath,
      [join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"), rendererPath],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          EMAIL_SERVICE_PATH: join(ROOT, "lib", "services", "email.ts"),
          TZ: timeZone,
        },
        killSignal: "SIGKILL",
        timeout: 15_000,
      },
    );

    assertReminderRendererSucceeded(result);
    return JSON.parse(result.stdout) as string[][];
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
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

  it("bounds and force-terminates the timezone renderer subprocess", () => {
    const spawn = vi.fn(() => ({
      error: undefined,
      output: [null, "[]", ""],
      pid: 123,
      signal: null,
      status: 0,
      stderr: "",
      stdout: "[]",
    }));

    expect(
      renderReminderDateLines("America/Los_Angeles", spawn as unknown as typeof spawnSync),
    ).toEqual([]);
    expect(spawn).toHaveBeenCalledTimes(1);

    const options = spawn.mock.calls[0]?.[2];
    expect(options?.timeout).toBeGreaterThan(0);
    expect(options?.timeout).toBeLessThan(30_000);
    expect(options?.killSignal).toBe("SIGKILL");
  });

  it.each([
    {
      label: "spawn error",
      result: {
        error: new Error(`spawn timeout ${"x".repeat(2_000)} UNBOUNDED_TAIL`),
        status: null,
        stderr: "renderer stderr",
      },
      expected: /failed to start.*spawn timeout/i,
    },
    {
      label: "nonzero status",
      result: {
        error: undefined,
        status: 7,
        stderr: `renderer failure ${"x".repeat(2_000)} UNBOUNDED_TAIL`,
      },
      expected: /exited with status 7.*renderer failure/i,
    },
    {
      label: "unexpected stderr",
      result: {
        error: undefined,
        status: 0,
        stderr: `renderer warning ${"x".repeat(2_000)} UNBOUNDED_TAIL`,
      },
      expected: /wrote to stderr.*renderer warning/i,
    },
  ])("reports bounded $label diagnostics before parsing stdout", ({ result, expected }) => {
    const spawn = vi.fn(() => ({
      output: [null, "INVALID_JSON", result.stderr],
      pid: 123,
      signal: null,
      stdout: "INVALID_JSON",
      ...result,
    }));

    let thrown: unknown;
    try {
      renderReminderDateLines("America/Los_Angeles", spawn as unknown as typeof spawnSync);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toMatch(expected);
    expect(message).not.toContain("UNBOUNDED_TAIL");
    expect(message.length).toBeLessThan(1_000);
    expect(message).not.toContain("Unexpected token");
  });

  it("renders class and assignment reminder dates in Nairobi under a non-Kenyan host timezone", () => {
    const kenya = renderReminderDateLines("Africa/Nairobi");
    const losAngeles = renderReminderDateLines("America/Los_Angeles");

    expect(losAngeles).toEqual(kenya);
    expect(losAngeles).toEqual([
      ["Start: 15 Jul 2026, 11:00", "End: 15 Jul 2026, 12:30"],
      ["Due: 16 Jul 2026, 13:15"],
    ]);
  }, 30_000);

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

  it("rejects invalid DNS labels before transport with zero attempts and no log", async () => {
    configureSmtp();
    const invalidRecipients = [
      `student@${"a".repeat(64)}.example`,
      "student@example..com",
      "student@example-.com",
    ];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { sendClassReminderEmail } = await import("../../../lib/services/email");

    const results = [];
    for (const recipientEmail of invalidRecipients) {
      results.push(
        await sendClassReminderEmail({
          recipientEmail,
          recipientName: "Private Student",
          classTitle: "Private Mathematics Class",
          startAt: new Date("2026-07-15T08:00:00.000Z"),
          endAt: new Date("2026-07-15T09:00:00.000Z"),
          liveLessonUrl: "https://example.com/private-live-class",
        }),
      );
    }

    expect(results).toEqual(
      invalidRecipients.map(() => ({
        delivered: false,
        reason: "SEND_FAILED",
        attempts: 0,
      })),
    );
    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("rejects malformed reserved A-labels before transport without logging them", async () => {
    configureSmtp();
    const invalidRecipients = [
      "student@xn--a.example",
      "student@xn--0.example",
      "student@example.xn--abc",
      "student@xn---bba.example",
    ];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { sendClassReminderEmail } = await import("../../../lib/services/email");

    const results = [];
    for (const recipientEmail of invalidRecipients) {
      results.push(
        await sendClassReminderEmail({
          recipientEmail,
          recipientName: "Private Student",
          classTitle: "Private Mathematics Class",
          startAt: new Date("2026-07-15T08:00:00.000Z"),
          endAt: new Date("2026-07-15T09:00:00.000Z"),
          liveLessonUrl: "https://example.com/private-live-class",
        }),
      );
    }

    expect(results).toEqual(
      invalidRecipients.map(() => ({
        delivered: false,
        reason: "SEND_FAILED",
        attempts: 0,
      })),
    );
    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    const logged = JSON.stringify(errorSpy.mock.calls);
    for (const invalidRecipient of invalidRecipients) {
      expect(logged).not.toContain(invalidRecipient);
    }
  });

  it("delivers to exact valid 63-octet and canonical A-label DNS recipients", async () => {
    configureSmtp();
    const validRecipients = [
      `student@${"a".repeat(63)}.example`,
      "student@xn--bcher-kva.example",
      "student@XN--BCHER-KVA.example",
      "student@example.xn--p1ai",
    ];
    const { sendClassReminderEmail } = await import("../../../lib/services/email");

    const results = [];
    for (const recipientEmail of validRecipients) {
      results.push(
        await sendClassReminderEmail({
          recipientEmail,
          recipientName: "Student",
          classTitle: "Mathematics",
          startAt: new Date("2026-07-15T08:00:00.000Z"),
          endAt: new Date("2026-07-15T09:00:00.000Z"),
          liveLessonUrl: "https://example.com/live",
        }),
      );
    }

    expect(results).toEqual(validRecipients.map(() => ({ delivered: true, attempts: 1 })));
    expect(sendMailMock.mock.calls.map(([message]) => message.to)).toEqual(
      validRecipients.map((address) => ({ name: "", address })),
    );
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
