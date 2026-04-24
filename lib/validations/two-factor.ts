import { z } from "zod";

export const twoFactorVerifySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter a 6-digit code.")
    .optional()
    .or(z.literal("")),
  backupCode: z
    .string()
    .trim()
    .regex(/^[A-Z0-9-]{6,32}$/i, "Backup code format is invalid.")
    .optional()
    .or(z.literal("")),
});

export type TwoFactorVerifyInput = z.infer<typeof twoFactorVerifySchema>;

export type TwoFactorFormState = {
  success: boolean;
  message: string;
  errors?: Partial<Record<keyof TwoFactorVerifyInput, string[]>>;
};
