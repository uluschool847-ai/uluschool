import addressparser from "nodemailer/lib/addressparser";
import { z } from "zod";

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const MAX_MAILBOX_LENGTH = 254;
const MAX_LOCAL_PART_LENGTH = 64;
const MAX_SENDER_NAME_CODE_POINTS = 200;
const MAX_SUBJECT_CODE_POINTS = 200;
const MAILBOX_SCHEMA = z.string().max(MAX_MAILBOX_LENGTH).email();

export type StructuredEmailAddress = {
  name: string;
  address: string;
};

export function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
}

export function sanitizeEmailSubject(value: unknown) {
  const normalized = String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim();

  return Array.from(normalized).slice(0, MAX_SUBJECT_CODE_POINTS).join("");
}

function hasValidMailboxSyntax(value: string) {
  const separatorIndex = value.lastIndexOf("@");
  if (separatorIndex <= 0 || separatorIndex !== value.indexOf("@")) {
    return false;
  }

  const localPart = value.slice(0, separatorIndex);
  return localPart.length <= MAX_LOCAL_PART_LENGTH && MAILBOX_SCHEMA.safeParse(value).success;
}

function parseOneAddress(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    /[\r\n]/.test(value)
  ) {
    return null;
  }

  const parsed = addressparser(value, { flatten: false });
  if (parsed.length !== 1 || "group" in parsed[0]) {
    return null;
  }

  return parsed[0];
}

function hasControlCharacter(value: string) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
}

export function parseSingleMailbox(value: unknown): StructuredEmailAddress | null {
  const parsed = parseOneAddress(value);
  if (
    !parsed ||
    parsed.name !== "" ||
    parsed.address !== value ||
    !hasValidMailboxSyntax(parsed.address)
  ) {
    return null;
  }

  return { name: "", address: parsed.address };
}

export function parseEmailSender(value: unknown): StructuredEmailAddress | null {
  const parsed = parseOneAddress(value);
  if (!parsed || !hasValidMailboxSyntax(parsed.address)) {
    return null;
  }

  if (parsed.name === "") {
    return parsed.address === value ? { name: "", address: parsed.address } : null;
  }

  const addressSuffix = ` <${parsed.address}>`;
  if (
    typeof value !== "string" ||
    !value.endsWith(addressSuffix) ||
    Array.from(parsed.name).length > MAX_SENDER_NAME_CODE_POINTS ||
    hasControlCharacter(parsed.name)
  ) {
    return null;
  }

  return { name: parsed.name, address: parsed.address };
}
