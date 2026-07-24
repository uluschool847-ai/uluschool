import { z } from "zod";

import { mailboxSchema } from "@/lib/validations/mailbox";

export { MAX_MAILBOX_ADDRESS_LENGTH } from "@/lib/validations/mailbox";

export const loginSchema = z.object({
  email: mailboxSchema,
  password: z.string().min(8, "Password is required."),
});

export type LoginInput = z.infer<typeof loginSchema>;

export type LoginFormState = {
  success: boolean;
  message: string;
  errors?: Partial<Record<keyof LoginInput, string[]>>;
  retryAfter?: number;
};
