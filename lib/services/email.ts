import nodemailer from "nodemailer";

import { validateLiveLessonUrl } from "@/lib/lessons/live-lesson-url";
import { escapeHtml, sanitizeEmailHeader } from "@/lib/security/escape-html";
import type { ContactInput } from "@/lib/validations/contact";
import type { EnrolmentInput } from "@/lib/validations/enrolment";

type EmailDeliveryResult =
  | { delivered: true; attempts: number }
  | { delivered: false; reason: "SMTP_NOT_CONFIGURED" | "SEND_FAILED"; attempts: number };

function getSmtpConfig() {
  const host = process.env.SMTP_HOST ?? "";
  const port = process.env.SMTP_PORT ?? "";
  const user = process.env.SMTP_USER ?? "";
  const pass = process.env.SMTP_PASS ?? "";

  const isPlaceholderDefault =
    host === "smtp.example.com" && user === "username" && pass === "password";

  if (isPlaceholderDefault) {
    return null;
  }

  if (host && port && user && pass) {
    return {
      host,
      port: Number(port),
      secure: (process.env.SMTP_SECURE ?? "false") === "true",
      auth: {
        user,
        pass,
      },
    };
  }

  // Backward-compatible fallback for EMAIL_USER/EMAIL_PASS.
  const emailUser = process.env.EMAIL_USER ?? "";
  const emailPass = process.env.EMAIL_PASS ?? "";
  if (!emailUser || !emailPass) {
    return null;
  }

  return {
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  };
}

function getFromAddress() {
  return process.env.SMTP_FROM ?? "ULU Online School <no-reply@uluglobalacademy.com>";
}

function getToAddress() {
  return process.env.SCHOOL_INBOX_EMAIL ?? "info@uluglobalacademy.com";
}

function buildEnrolmentMessage(payload: EnrolmentInput) {
  const subject = `New enrolment enquiry: ${payload.studentName}`;
  const text = [
    "A new enrolment enquiry has been submitted.",
    "",
    `Student Name: ${payload.studentName}`,
    `Age/Year Level: ${payload.ageYearLevel}`,
    `Subjects: ${payload.subjects.join(", ")}`,
    `Curriculum Level: ${payload.curriculumLevel}`,
    `Parent/Guardian: ${payload.parentGuardianName}`,
    `Email: ${payload.email}`,
    `Phone/WhatsApp: ${payload.phoneWhatsapp}`,
    `Preferred Schedule: ${payload.preferredSchedule}`,
    `Additional Notes: ${payload.additionalNotes || "N/A"}`,
  ].join("\n");
  const safeStudentName = escapeHtml(payload.studentName);
  const safeAgeYearLevel = escapeHtml(payload.ageYearLevel);
  const safeSubjects = escapeHtml(payload.subjects.join(", "));
  const safeCurriculumLevel = escapeHtml(payload.curriculumLevel);
  const safeParentGuardianName = escapeHtml(payload.parentGuardianName);
  const safeEmail = escapeHtml(payload.email);
  const safePhoneWhatsapp = escapeHtml(payload.phoneWhatsapp);
  const safePreferredSchedule = escapeHtml(payload.preferredSchedule);
  const safeAdditionalNotes = escapeHtml(payload.additionalNotes || "N/A");

  const html = `
    <h2>New Enrolment Enquiry</h2>
    <p><strong>Student Name:</strong> ${safeStudentName}</p>
    <p><strong>Age/Year Level:</strong> ${safeAgeYearLevel}</p>
    <p><strong>Subjects:</strong> ${safeSubjects}</p>
    <p><strong>Curriculum Level:</strong> ${safeCurriculumLevel}</p>
    <p><strong>Parent/Guardian:</strong> ${safeParentGuardianName}</p>
    <p><strong>Email:</strong> ${safeEmail}</p>
    <p><strong>Phone/WhatsApp:</strong> ${safePhoneWhatsapp}</p>
    <p><strong>Preferred Schedule:</strong> ${safePreferredSchedule}</p>
    <p><strong>Additional Notes:</strong> ${safeAdditionalNotes}</p>
  `;

  return { subject, text, html, replyTo: payload.email };
}

function buildContactMessage(payload: ContactInput) {
  const subject = `New contact enquiry: ${payload.fullName}`;
  const text = [
    "A new contact enquiry has been submitted.",
    "",
    `Full Name: ${payload.fullName}`,
    `Email: ${payload.email}`,
    `Phone/WhatsApp: ${payload.phoneWhatsapp || "N/A"}`,
    `Student Grade: ${payload.studentGrade || "N/A"}`,
    `Message: ${payload.message}`,
  ].join("\n");
  const safeFullName = escapeHtml(payload.fullName);
  const safeEmail = escapeHtml(payload.email);
  const safePhoneWhatsapp = escapeHtml(payload.phoneWhatsapp || "N/A");
  const safeStudentGrade = escapeHtml(payload.studentGrade || "N/A");
  const safeMessageHtml = escapeHtml(payload.message).replace(/\r?\n/g, "<br/>");

  const html = `
    <h2>New Contact Enquiry</h2>
    <p><strong>Full Name:</strong> ${safeFullName}</p>
    <p><strong>Email:</strong> ${safeEmail}</p>
    <p><strong>Phone/WhatsApp:</strong> ${safePhoneWhatsapp}</p>
    <p><strong>Student Grade:</strong> ${safeStudentGrade}</p>
    <p><strong>Message:</strong><br/>${safeMessageHtml}</p>
  `;

  return { subject, text, html, replyTo: payload.email };
}

async function sendWithRetry(message: {
  subject: string;
  text: string;
  html: string;
  replyTo: string;
}): Promise<EmailDeliveryResult> {
  const smtp = getSmtpConfig();
  if (!smtp) {
    if ((process.env.NODE_ENV ?? "development") !== "production") {
      console.info("[email] SMTP is not configured. Skipping delivery in local/dev mode.");
    }
    return { delivered: false, reason: "SMTP_NOT_CONFIGURED", attempts: 0 };
  }

  const transporter = nodemailer.createTransport(smtp);
  const maxAttempts = Number(process.env.SMTP_MAX_RETRIES ?? "3");

  let attempts = 0;
  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      await transporter.sendMail({
        from: sanitizeEmailHeader(getFromAddress()),
        to: sanitizeEmailHeader(getToAddress()),
        replyTo: sanitizeEmailHeader(message.replyTo),
        subject: sanitizeEmailHeader(message.subject),
        text: message.text,
        html: message.html,
      });
      return { delivered: true, attempts };
    } catch (error) {
      if (attempts >= maxAttempts) {
        console.error("Email delivery failed", {
          errorType: error instanceof Error ? "Error" : "UnknownError",
        });
        return { delivered: false, reason: "SEND_FAILED", attempts };
      }
      await new Promise((resolve) => setTimeout(resolve, attempts * 250));
    }
  }

  return { delivered: false, reason: "SEND_FAILED", attempts };
}

export async function sendEnquiryEmail(payload: EnrolmentInput) {
  return sendWithRetry(buildEnrolmentMessage(payload));
}

export async function sendContactEmail(payload: ContactInput) {
  return sendWithRetry(buildContactMessage(payload));
}

export async function sendClassReminderEmail(input: {
  recipientEmail: string;
  recipientName: string;
  classTitle: string;
  startAt: Date;
  endAt: Date;
  liveLessonUrl: string;
}) {
  const formattedStart = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(input.startAt);
  const formattedEnd = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(input.endAt);
  const linkValidation = validateLiveLessonUrl(input.liveLessonUrl, "MANUAL_URL", {
    required: false,
  });
  const safeUrl = linkValidation.ok ? linkValidation.url : null;
  const liveLessonLine = safeUrl ? `Join link: ${safeUrl}` : input.liveLessonUrl;
  const liveLessonHtml = safeUrl
    ? `<p><a href="${escapeHtml(safeUrl)}">Join Live Lesson</a></p>`
    : `<p>${escapeHtml(input.liveLessonUrl)}</p>`;
  const safeRecipientName = escapeHtml(input.recipientName);
  const safeClassTitle = escapeHtml(input.classTitle);
  const safeFormattedStart = escapeHtml(formattedStart);
  const safeFormattedEnd = escapeHtml(formattedEnd);

  return sendWithRetry({
    subject: `Class reminder: ${input.classTitle}`,
    replyTo: getToAddress(),
    text: [
      `Hello ${input.recipientName},`,
      "",
      `This is a reminder for your upcoming class: ${input.classTitle}`,
      `Start: ${formattedStart}`,
      `End: ${formattedEnd}`,
      liveLessonLine,
      "",
      "ULU Online School",
    ].join("\n"),
    html: `
      <h2>Class Reminder</h2>
      <p>Hello ${safeRecipientName},</p>
      <p>This is a reminder for your upcoming class: <strong>${safeClassTitle}</strong></p>
      <p><strong>Start:</strong> ${safeFormattedStart}</p>
      <p><strong>End:</strong> ${safeFormattedEnd}</p>
      ${liveLessonHtml}
      <p>ULU Online School</p>
    `,
  });
}

export async function sendAssignmentReminderEmail(input: {
  recipientEmail: string;
  recipientName: string;
  assignmentTitle: string;
  dueDate: Date;
  assignmentHref: string;
}) {
  const formattedDueDate = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(input.dueDate);
  const safeRecipientName = escapeHtml(input.recipientName);
  const safeAssignmentTitle = escapeHtml(input.assignmentTitle);
  const safeFormattedDueDate = escapeHtml(formattedDueDate);
  const safeAssignmentHref = escapeHtml(input.assignmentHref);

  return sendWithRetry({
    subject: `Assignment overdue: ${input.assignmentTitle}`,
    replyTo: getToAddress(),
    text: [
      `Hello ${input.recipientName},`,
      "",
      `This is a reminder that your assignment is overdue: ${input.assignmentTitle}`,
      `Due: ${formattedDueDate}`,
      `Open assignment: ${input.assignmentHref}`,
      "",
      "Please submit it as soon as possible.",
      "",
      "ULU Online School",
    ].join("\n"),
    html: `
      <h2>Assignment Reminder</h2>
      <p>Hello ${safeRecipientName},</p>
      <p>This is a reminder that your assignment is overdue: <strong>${safeAssignmentTitle}</strong></p>
      <p><strong>Due:</strong> ${safeFormattedDueDate}</p>
      <p><a href="${safeAssignmentHref}">Open assignment</a></p>
      <p>Please submit it as soon as possible.</p>
      <p>ULU Online School</p>
    `,
  });
}
