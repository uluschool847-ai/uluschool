import { z } from "zod";

export const contactSchema = z.object({
  fullName: z.string().min(2, "Full name is required."),
  email: z.string().email("Enter a valid email address."),
  phoneWhatsapp: z
    .string()
    .max(40, "Phone number is too long.")
    .optional()
    .or(z.literal("")),
  studentGrade: z
    .string()
    .max(120, "Student grade is too long.")
    .optional()
    .or(z.literal("")),
  message: z.string().min(10, "Message is too short.").max(1500, "Message is too long."),
});

export type ContactInput = z.infer<typeof contactSchema>;

export type ContactFormState = {
  success: boolean;
  message: string;
  errors?: Partial<Record<keyof ContactInput, string[]>>;
};
