import { z } from "zod";

export const MAX_MAILBOX_ADDRESS_LENGTH = 254;

export const mailboxSchema = z
  .string()
  .trim()
  .max(MAX_MAILBOX_ADDRESS_LENGTH, "Email address is too long.")
  .email("Enter a valid email address.")
  .transform((email) => email.toLowerCase());

export function normalizeMailboxAddress(value: string) {
  const parsed = mailboxSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Enter a valid email address.");
  }

  return parsed.data;
}
