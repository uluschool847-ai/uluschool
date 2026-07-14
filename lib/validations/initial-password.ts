import { z } from "zod";

export const INITIAL_PASSWORD_MAX_LENGTH = 256;

export const initialPasswordMessages = {
  invalidInput: "Invalid input.",
  currentRequired: "Enter your current password.",
  minimumLength: "Use at least 12 characters.",
  maximumLength: "Use 256 characters or fewer.",
  mismatch: "Passwords do not match.",
  setupExpired: "Your setup session has expired. Please sign in again.",
  setupInvalid: "Your setup session is no longer valid. Please sign in again.",
  currentIncorrect: "The current password is incorrect.",
  passwordReuse: "Choose a password you have not used for this account.",
  unexpected: "Unable to change your password. Please try again.",
} as const;

export const initialPasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(8, initialPasswordMessages.currentRequired)
      .max(INITIAL_PASSWORD_MAX_LENGTH, initialPasswordMessages.maximumLength),
    newPassword: z
      .string()
      .min(12, initialPasswordMessages.minimumLength)
      .max(INITIAL_PASSWORD_MAX_LENGTH, initialPasswordMessages.maximumLength),
    confirmPassword: z
      .string()
      .min(12, initialPasswordMessages.minimumLength)
      .max(INITIAL_PASSWORD_MAX_LENGTH, initialPasswordMessages.maximumLength),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: initialPasswordMessages.mismatch,
  });

type InitialPasswordField = "currentPassword" | "newPassword" | "confirmPassword";

export type InitialPasswordFieldErrors = Partial<Record<InitialPasswordField, string[]>>;

export type InitialPasswordFormState = {
  success: false;
  message: (typeof initialPasswordMessages)[keyof typeof initialPasswordMessages] | "";
  errors?: InitialPasswordFieldErrors;
};

const INITIAL_PASSWORD_FIELDS = new Set<InitialPasswordField>([
  "currentPassword",
  "newPassword",
  "confirmPassword",
]);

const ALLOWED_FIELD_MESSAGES = new Set<string>([
  initialPasswordMessages.currentRequired,
  initialPasswordMessages.minimumLength,
  initialPasswordMessages.maximumLength,
  initialPasswordMessages.mismatch,
]);

export function getSafeInitialPasswordFieldErrors(error: z.ZodError): InitialPasswordFieldErrors {
  const errors: InitialPasswordFieldErrors = {};

  for (const issue of error.issues) {
    const field = issue.path[0];
    if (
      typeof field !== "string" ||
      !INITIAL_PASSWORD_FIELDS.has(field as InitialPasswordField) ||
      !ALLOWED_FIELD_MESSAGES.has(issue.message)
    ) {
      continue;
    }

    const safeField = field as InitialPasswordField;
    const messages = errors[safeField] ?? [];
    if (!messages.includes(issue.message)) {
      errors[safeField] = [...messages, issue.message];
    }
  }

  return errors;
}
