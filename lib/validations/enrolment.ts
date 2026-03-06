import { z } from "zod";

export const enrolmentSchema = z.object({
  studentName: z.string().min(2, "Student name is required."),
  ageYearLevel: z.string().min(1, "Age or year level is required."),
  subjects: z.array(z.string().min(1)).min(1, "Select at least one subject."),
  curriculumLevel: z.string().min(1, "Curriculum level is required."),
  parentGuardianName: z.string().min(2, "Parent or guardian name is required."),
  email: z.string().email("Enter a valid email address."),
  phoneWhatsapp: z.string().min(7, "Phone or WhatsApp number is required."),
  preferredSchedule: z.string().min(3, "Preferred schedule is required."),
  additionalNotes: z
    .string()
    .max(1000, "Additional notes are too long.")
    .optional()
    .or(z.literal("")),
});

export type EnrolmentInput = z.infer<typeof enrolmentSchema>;

export type EnrolmentFormState = {
  success: boolean;
  message: string;
  errors?: Partial<Record<keyof EnrolmentInput, string[]>>;
};
