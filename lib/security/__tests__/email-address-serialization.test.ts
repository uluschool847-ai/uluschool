import nodemailer from "nodemailer";
import { describe, expect, it } from "vitest";

import {
  parseEmailSender,
  parseSingleMailbox,
  sanitizeEmailSubject,
} from "@/lib/security/escape-html";

const SERIALIZED_CONTROL_CODE_POINTS = [0x00, 0x01, 0x09, 0x1f, 0x7f, 0x80, 0x85, 0x9f];
const ENCODED_CONTROL_FRAGMENTS = ["=00", "=01", "=09", "=1F", "=7F", "=C2=80", "=C2=85", "=C2=9F"];

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

  it("normalizes subject controls before real serialization", async () => {
    const controls = SERIALIZED_CONTROL_CODE_POINTS.map((codePoint) =>
      String.fromCodePoint(codePoint),
    ).join("");
    const from = parseEmailSender("ULU Online School <no-reply@uluglobalacademy.com>");
    const to = parseSingleMailbox("student@example.com");
    const subject = sanitizeEmailSubject(`Safe${controls}Subject`);
    expect(from).not.toBeNull();
    expect(to).not.toBeNull();
    if (!from || !to) {
      throw new Error("Valid control-boundary fixtures must parse");
    }

    const transporter = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: "unix",
    });
    const result = await transporter.sendMail({ from, to, subject, text: "Control boundary" });
    const serialized = Buffer.isBuffer(result.message)
      ? result.message.toString("utf8")
      : String(result.message);

    expect(subject).toBe("Safe Subject");
    expect(serialized).toContain("Subject: Safe Subject");
    for (const codePoint of SERIALIZED_CONTROL_CODE_POINTS) {
      expect(serialized).not.toContain(String.fromCodePoint(codePoint));
    }
    for (const encodedControl of ENCODED_CONTROL_FRAGMENTS) {
      expect(serialized).not.toContain(encodedControl);
    }
  });

  it("rejects controlled raw senders before real serialization", () => {
    for (const codePoint of SERIALIZED_CONTROL_CODE_POINTS) {
      const control = String.fromCodePoint(codePoint);
      expect(parseEmailSender(`ULU${control} School <no-reply@uluglobalacademy.com>`)).toBeNull();
    }
  });
});
