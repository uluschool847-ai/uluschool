"use server";

import { getAttributionFromRequest } from "@/lib/analytics/attribution";
import { generateSubmissionReferenceId } from "@/lib/reference-id";
import { createEnquiry } from "@/lib/repositories/enquiry-repository";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  getRequestIdentifier,
  honeypotTriggered,
  submittedTooFast,
} from "@/lib/security/spam-guard";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { sendEnquiryEmail } from "@/lib/services/email";
import { type EnrolmentFormState, enrolmentSchema } from "@/lib/validations/enrolment";

export async function submitEnrolment(
  _prevState: EnrolmentFormState,
  formData: FormData,
): Promise<EnrolmentFormState> {
  const now = new Date();
  const requestIdentifier = await getRequestIdentifier();
  const rateLimit = checkRateLimit({
    bucket: "enrol-form",
    identifier: requestIdentifier,
    max: Number(process.env.ENROL_FORM_MAX_REQUESTS ?? "5"),
    windowMs: Number(process.env.ENROL_FORM_WINDOW_MS ?? "600000"),
  });

  if (!rateLimit.ok) {
    return {
      success: false,
      message: "Too many attempts. Please wait a few minutes and try again.",
    };
  }

  if (
    honeypotTriggered(formData.get("companyWebsite")) ||
    submittedTooFast(formData.get("startedAt"))
  ) {
    return {
      success: true,
      message:
        "Thank you. Your enquiry has been submitted successfully. We will contact you shortly.",
    };
  }

  const captcha = await verifyTurnstileToken(
    formData.get("cf-turnstile-response"),
    requestIdentifier,
  );

  if (!captcha.ok) {
    return {
      success: false,
      message: "Please complete the anti-spam verification and submit again.",
    };
  }

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
      message: "Please enter valid details in the highlighted fields.",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const data = parsed.data;
    const attribution = await getAttributionFromRequest();
    const referenceId = generateSubmissionReferenceId({
      prefix: "MS",
      year: now.getFullYear(),
      recordType: "enrolment",
    });

    const enquiry = await createEnquiry({ ...data, referenceId }, attribution);
    const emailResult = await sendEnquiryEmail(data);
    const nextSteps = "We will contact you within 24 hours to arrange the trial class.";

    if (!emailResult.delivered) {
      console.warn("Enrolment saved but email delivery failed", emailResult.reason);
    }

    return {
      success: true,
      message: emailResult.delivered
        ? "Thank you. Your enquiry has been submitted successfully. We will contact you shortly."
        : "Thank you. Your enquiry has been submitted. Our team will follow up soon.",
      referenceId,
      submittedAt: (enquiry.createdAt ?? now).toISOString(),
      adminPath: `/admin/enquiries/${enquiry.id}`,
      nextSteps,
    };
  } catch (error) {
    console.error("Enrolment submission failed", error);
    return {
      success: false,
      message: "Unable to submit enquiry right now. Please try again in a few minutes.",
    };
  }
}
