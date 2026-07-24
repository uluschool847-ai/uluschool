"use server";

import { getAttributionFromRequest } from "@/lib/analytics/attribution";
import { generateSubmissionReferenceId } from "@/lib/reference-id";
import { createContactLead } from "@/lib/repositories/contact-lead-repository";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  getRequestIdentifier,
  honeypotTriggered,
  submittedTooFast,
} from "@/lib/security/spam-guard";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { sendContactEmail } from "@/lib/services/email";
import { type ContactFormState, contactSchema } from "@/lib/validations/contact";

export async function submitContactEnquiry(
  _prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const now = new Date();
  const requestIdentifier = await getRequestIdentifier();
  const rateLimit = checkRateLimit({
    bucket: "contact-form",
    identifier: requestIdentifier,
    max: Number(process.env.CONTACT_FORM_MAX_REQUESTS ?? "8"),
    windowMs: Number(process.env.CONTACT_FORM_WINDOW_MS ?? "600000"),
  });

  if (!rateLimit.ok) {
    return {
      success: false,
      message: "Too many attempts. Please wait a few minutes and try again.",
    };
  }

  const rawInput = {
    fullName: String(formData.get("fullName") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    phoneWhatsapp: String(formData.get("phoneWhatsapp") || "").trim(),
    studentGrade: String(formData.get("studentGrade") || "").trim(),
    message: String(formData.get("message") || "").trim(),
  };

  const parsed = contactSchema.safeParse(rawInput);

  if (!parsed.success) {
    return {
      success: false,
      message: "Please enter valid details in the highlighted fields.",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  if (
    honeypotTriggered(formData.get("companyWebsite")) ||
    submittedTooFast(formData.get("startedAt"))
  ) {
    return {
      success: true,
      message: "Thank you. Your message has been submitted successfully.",
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

  try {
    const data = parsed.data;
    const attribution = await getAttributionFromRequest();
    const referenceId = generateSubmissionReferenceId({
      prefix: "MS",
      year: now.getFullYear(),
      recordType: "contact",
    });
    const lead = await createContactLead({ ...data, referenceId }, attribution);
    const emailResult = await sendContactEmail(data);
    const nextSteps = "We will contact you within 24 hours.";

    if (!emailResult.delivered) {
      console.warn("Contact lead saved but email delivery failed", emailResult.reason);
    }

    return {
      success: true,
      message: emailResult.delivered
        ? "Thank you. Your message has been submitted successfully."
        : "Thank you. Your message has been received. Our team will follow up soon.",
      referenceId,
      submittedAt: (lead.createdAt ?? now).toISOString(),
      nextSteps,
    };
  } catch (error) {
    console.error("Contact submission failed", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return {
      success: false,
      message: "Unable to submit your message right now. Please try again in a few minutes.",
    };
  }
}
