"use server";

import { createEnquiry } from "@/lib/repositories/enquiry-repository";
import { sendEnquiryEmail } from "@/lib/services/email";
import { type EnrolmentFormState, enrolmentSchema } from "@/lib/validations/enrolment";

export async function submitEnrolment(
  _prevState: EnrolmentFormState,
  formData: FormData,
): Promise<EnrolmentFormState> {
  const rawInput = {
    studentName: String(formData.get("studentName") || "").trim(),
    ageYearLevel: String(formData.get("ageYearLevel") || "").trim(),
    subjects: formData
      .getAll("subjects")
      .map((value) => String(value).trim())
      .filter(Boolean),
    curriculumLevel: String(formData.get("curriculumLevel") || "").trim(),
    parentGuardianName: String(formData.get("parentGuardianName") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    phoneWhatsapp: String(formData.get("phoneWhatsapp") || "").trim(),
    preferredSchedule: String(formData.get("preferredSchedule") || "").trim(),
    additionalNotes: String(formData.get("additionalNotes") || "").trim(),
  };

  const parsed = enrolmentSchema.safeParse(rawInput);

  if (!parsed.success) {
    return {
      success: false,
      message: "Please review the form and fix the highlighted fields.",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const data = parsed.data;

    await createEnquiry(data);
    await sendEnquiryEmail(data);

    return {
      success: true,
      message:
        "Thank you. Your enquiry has been submitted successfully. We will contact you shortly.",
    };
  } catch (error) {
    console.error("Enrolment submission failed", error);
    return {
      success: false,
      message: "Unable to submit enquiry right now. Please try again in a few minutes.",
    };
  }
}
