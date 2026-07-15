import nodemailer from "nodemailer";
import { describe, expect, it } from "vitest";

import {
  parseEmailSender,
  parseSingleMailbox,
  sanitizeEmailSubject,
} from "@/lib/security/escape-html";

describe("serialized email address boundary", () => {
  it("cannot serialize an injected recipient and preserves exact valid recipients", async () => {
    const injectedRecipient = parseSingleMailbox("victim@example.com\r\nBcc: attacker@example.com");
    const from = parseEmailSender("ULU Online School <no-reply@uluglobalacademy.com>");
    const to = parseSingleMailbox("student@example.com");
    const replyTo = parseSingleMailbox("info@uluglobalacademy.com");

    expect(injectedRecipient).toBeNull();
    expect(from).not.toBeNull();
    expect(to).not.toBeNull();
    expect(replyTo).not.toBeNull();
    if (!from || !to || !replyTo) {
      throw new Error("Valid serialization fixtures must parse");
    }

    const transporter = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: "unix",
    });
    const result = await transporter.sendMail({
      from,
      to,
      replyTo,
      subject: sanitizeEmailSubject("Class reminder\r\nBcc: blocked"),
      text: "Reminder",
    });
    const serialized = Buffer.isBuffer(result.message)
      ? result.message.toString("utf8")
      : String(result.message);

    expect(result.envelope).toEqual({
      from: "no-reply@uluglobalacademy.com",
      to: ["student@example.com"],
    });
    expect(serialized).toContain("To: student@example.com");
    expect(serialized).toContain("Reply-To: info@uluglobalacademy.com");
    expect(serialized).not.toContain("attacker@example.com");
    expect(serialized).not.toMatch(/\r?\nBcc:/i);
  });
});
