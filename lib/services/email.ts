import nodemailer from "nodemailer";

import type { ContactInput } from "@/lib/validations/contact";
import type { EnrolmentInput } from "@/lib/validations/enrolment";

type EmailDeliveryResult =
  | { delivered: true; attempts: number }
  | { delivered: false; reason: "SMTP_NOT_CONFIGURED" | "SEND_FAILED"; attempts: number };

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && port && user && pass) {
    return {
      host,
      port: Number(port),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user,
        pass,
      },
    };
  }

  // Backward-compatible fallback for EMAIL_USER/EMAIL_PASS.
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;
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
  return process.env.SMTP_FROM || "ULU Online School <no-reply@uluglobalacademy.com>";
}

function getToAddress() {
  return process.env.SCHOOL_INBOX_EMAIL || "info@uluglobalacademy.com";
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

  const html = `
    <h2>New Enrolment Enquiry</h2>
    <p><strong>Student Name:</strong> ${payload.studentName}</p>
    <p><strong>Age/Year Level:</strong> ${payload.ageYearLevel}</p>
    <p><strong>Subjects:</strong> ${payload.subjects.join(", ")}</p>
    <p><strong>Curriculum Level:</strong> ${payload.curriculumLevel}</p>
    <p><strong>Parent/Guardian:</strong> ${payload.parentGuardianName}</p>
    <p><strong>Email:</strong> ${payload.email}</p>
    <p><strong>Phone/WhatsApp:</strong> ${payload.phoneWhatsapp}</p>
    <p><strong>Preferred Schedule:</strong> ${payload.preferredSchedule}</p>
    <p><strong>Additional Notes:</strong> ${payload.additionalNotes || "N/A"}</p>
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

  const html = `
    <h2>New Contact Enquiry</h2>
    <p><strong>Full Name:</strong> ${payload.fullName}</p>
    <p><strong>Email:</strong> ${payload.email}</p>
    <p><strong>Phone/WhatsApp:</strong> ${payload.phoneWhatsapp || "N/A"}</p>
    <p><strong>Student Grade:</strong> ${payload.studentGrade || "N/A"}</p>
    <p><strong>Message:</strong><br/>${payload.message.replace(/\n/g, "<br/>")}</p>
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
    return { delivered: false, reason: "SMTP_NOT_CONFIGURED", attempts: 0 };
  }

  const transporter = nodemailer.createTransport(smtp);
  const maxAttempts = Number(process.env.SMTP_MAX_RETRIES ?? "3");

  let attempts = 0;
  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      await transporter.sendMail({
        from: getFromAddress(),
        to: getToAddress(),
        replyTo: message.replyTo,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      return { delivered: true, attempts };
    } catch (error) {
      if (attempts >= maxAttempts) {
        console.error("Email delivery failed", error);
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

  return sendWithRetry({
    subject: `Class reminder: ${input.classTitle}`,
    replyTo: getToAddress(),
    text: [
      `Hello ${input.recipientName},`,
      "",
      `This is a reminder for your upcoming class: ${input.classTitle}`,
      `Start: ${formattedStart}`,
      `End: ${formattedEnd}`,
      `Join link: ${input.liveLessonUrl}`,
      "",
      "ULU Online School",
    ].join("\n"),
    html: `
      <h2>Class Reminder</h2>
      <p>Hello ${input.recipientName},</p>
      <p>This is a reminder for your upcoming class: <strong>${input.classTitle}</strong></p>
      <p><strong>Start:</strong> ${formattedStart}</p>
      <p><strong>End:</strong> ${formattedEnd}</p>
      <p><a href="${input.liveLessonUrl}">Join Live Lesson</a></p>
      <p>ULU Online School</p>
    `,
  });
}
