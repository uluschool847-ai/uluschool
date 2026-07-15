import { describe, expect, it } from "vitest";

import {
  escapeHtml,
  parseEmailSender,
  parseSingleMailbox,
  sanitizeEmailSubject,
} from "@/lib/security/escape-html";

describe("email content escaping", () => {
  it("escapes HTML text and attribute metacharacters exactly once", () => {
    expect(escapeHtml(`<img src="x" data-owner='Guardian'> & family`)).toBe(
      "&lt;img src=&quot;x&quot; data-owner=&#39;Guardian&#39;&gt; &amp; family",
    );
  });

  it("normalizes nullish and non-string values without throwing", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(0)).toBe("0");
    expect(escapeHtml(false)).toBe("false");
  });

  it("removes subject newlines and caps Unicode by code point", () => {
    const sanitized = sanitizeEmailSubject(`  ${"😀".repeat(205)}\r\nBcc: ignored  `);

    expect(sanitized).not.toMatch(/[\r\n]/);
    expect(Array.from(sanitized)).toHaveLength(200);
    expect(sanitized).toBe("😀".repeat(200));
    expect(sanitizeEmailSubject(null)).toBe("");
  });

  it("accepts only an exact single mailbox without repairing or truncating it", () => {
    expect(parseSingleMailbox("student+math@example.com")).toEqual({
      name: "",
      address: "student+math@example.com",
    });
    expect(parseSingleMailbox(`${"a".repeat(64)}@example.com`)).toEqual({
      name: "",
      address: `${"a".repeat(64)}@example.com`,
    });

    const overLengthMailbox = `a@${[
      "a".repeat(63),
      "b".repeat(63),
      "c".repeat(63),
      "d".repeat(61),
    ].join(".")}`;

    for (const invalidMailbox of [
      "",
      "   ",
      " student@example.com ",
      "not-an-email",
      "a..b@example.com",
      "Student <student@example.com>",
      "victim@example.com, attacker@example.com",
      "Students: victim@example.com;",
      "victim@example.com\r\nBcc: attacker@example.com",
      `${"a".repeat(65)}@example.com`,
      overLengthMailbox,
    ]) {
      expect(parseSingleMailbox(invalidMailbox)).toBeNull();
    }
  });

  it("parses the supported sender forms into a structured address and rejects redirection syntax", () => {
    expect(parseEmailSender("ULU Online School <no-reply@uluglobalacademy.com>")).toEqual({
      name: "ULU Online School",
      address: "no-reply@uluglobalacademy.com",
    });
    expect(parseEmailSender("no-reply@uluglobalacademy.com")).toEqual({
      name: "",
      address: "no-reply@uluglobalacademy.com",
    });
    expect(parseEmailSender('"ULU, School" <no-reply@uluglobalacademy.com>')).toEqual({
      name: "ULU, School",
      address: "no-reply@uluglobalacademy.com",
    });

    for (const invalidSender of [
      "",
      "ULU Online School <no-reply@uluglobalacademy.com>\r\nBcc: attacker@example.com",
      "ULU: attacker@example.com;",
      "no-reply@uluglobalacademy.com, attacker@example.com",
      `${"A".repeat(201)} <no-reply@uluglobalacademy.com>`,
    ]) {
      expect(parseEmailSender(invalidSender)).toBeNull();
    }
  });
});
