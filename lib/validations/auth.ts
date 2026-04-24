import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password is required."),
});

export type LoginInput = z.infer<typeof loginSchema>;

export type LoginFormState = {
  success: boolean;
  message: string;
  errors?: Partial<Record<keyof LoginInput, string[]>>;
};
