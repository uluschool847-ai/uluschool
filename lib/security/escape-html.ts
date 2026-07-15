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
const MAX_DOMAIN_LENGTH = 253;
const MAX_DOMAIN_LABEL_LENGTH = 63;
const MAX_SENDER_NAME_CODE_POINTS = 200;
const MAX_SUBJECT_CODE_POINTS = 200;
const LOCAL_PART_MAILBOX_SCHEMA = z.string().email();

export type StructuredEmailAddress = {
  name: string;
  address: string;
};

export function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
}

export function sanitizeEmailSubject(value: unknown) {
  let normalized = "";
  let previousWasControl = false;
  for (const character of String(value ?? "")) {
    if (isDisallowedHeaderControl(character)) {
      if (!previousWasControl) {
        normalized += " ";
      }
      previousWasControl = true;
      continue;
    }

    normalized += character;
    previousWasControl = false;
  }

  return Array.from(normalized.trim()).slice(0, MAX_SUBJECT_CODE_POINTS).join("");
}

function isDisallowedHeaderControl(character: string) {
  const codePoint = character.codePointAt(0);
  return codePoint !== undefined && (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f));
}

function hasDisallowedHeaderControl(value: string) {
  return Array.from(value).some(isDisallowedHeaderControl);
}

function isAsciiDnsCharacter(character: string) {
  const codePoint = character.codePointAt(0);
  return (
    codePoint !== undefined &&
    ((codePoint >= 0x30 && codePoint <= 0x39) ||
      (codePoint >= 0x41 && codePoint <= 0x5a) ||
      (codePoint >= 0x61 && codePoint <= 0x7a) ||
      codePoint === 0x2d)
  );
}

function hasValidDnsDomain(domain: string) {
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((label) => label.length === 0)) {
    return false;
  }

  for (const label of labels) {
    if (!Array.from(label).every(isAsciiDnsCharacter)) {
      return false;
    }

    // ASCII-only labels make JavaScript string length equal the DNS octet length.
    if (label.length > MAX_DOMAIN_LABEL_LENGTH || label.startsWith("-") || label.endsWith("-")) {
      return false;
    }
  }

  return domain.length <= MAX_DOMAIN_LENGTH;
}

function hasValidMailboxSyntax(value: string) {
  const separatorIndex = value.lastIndexOf("@");
  if (
    value.length > MAX_MAILBOX_LENGTH ||
    separatorIndex <= 0 ||
    separatorIndex !== value.indexOf("@")
  ) {
    return false;
  }

  const localPart = value.slice(0, separatorIndex);
  const domain = value.slice(separatorIndex + 1);
  return (
    localPart.length <= MAX_LOCAL_PART_LENGTH &&
    LOCAL_PART_MAILBOX_SCHEMA.safeParse(`${localPart}@example.com`).success &&
    hasValidDnsDomain(domain)
  );
}

function parseOneAddress(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    hasDisallowedHeaderControl(value)
  ) {
    return null;
  }

  const parsed = addressparser(value, { flatten: false });
  if (parsed.length !== 1 || "group" in parsed[0]) {
    return null;
  }

  return parsed[0];
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
    hasDisallowedHeaderControl(parsed.name)
  ) {
    return null;
  }

  return { name: parsed.name, address: parsed.address };
}
