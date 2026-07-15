import { z } from "zod";

export const MAX_MAILBOX_ADDRESS_LENGTH = 254;

export const loginSchema = z.object({
  email: z
    .string()
    .max(MAX_MAILBOX_ADDRESS_LENGTH, "Email address is too long.")
    .email("Enter a valid email address."),
  password: z.string().min(8, "Password is required."),
});

export type LoginInput = z.infer<typeof loginSchema>;

export type LoginFormState = {
  success: boolean;
  message: string;
  errors?: Partial<Record<keyof LoginInput, string[]>>;
  retryAfter?: number;
};
