import nodemailer from "nodemailer";

type EnquiryEmailPayload = {
  studentName: string;
  ageYearLevel: string;
  subjects: string[];
  curriculumLevel: string;
  parentGuardianName: string;
  email: string;
  phoneWhatsapp: string;
  preferredSchedule: string;
  additionalNotes?: string;
};

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

export async function sendEnquiryEmail(payload: EnquiryEmailPayload) {
  const smtp = getSmtpConfig();
  if (!smtp) {
    return { delivered: false, reason: "SMTP_NOT_CONFIGURED" as const };
  }

  const transporter = nodemailer.createTransport(smtp);
  const fallbackFrom = process.env.EMAIL_USER
    ? `ULU Online School <${process.env.EMAIL_USER}>`
    : "ULU Online School <no-reply@uluglobalacademy.com>";
  const from = process.env.SMTP_FROM || fallbackFrom;

  await transporter.sendMail({
    from,
    to: "info@uluglobalacademy.com",
    replyTo: payload.email,
    subject: `New enrolment enquiry: ${payload.studentName}`,
    text: [
      `Student Name: ${payload.studentName}`,
      `Age/Year Level: ${payload.ageYearLevel}`,
      `Subjects: ${payload.subjects.join(", ")}`,
      `Curriculum Level: ${payload.curriculumLevel}`,
      `Parent/Guardian: ${payload.parentGuardianName}`,
      `Email: ${payload.email}`,
      `Phone/WhatsApp: ${payload.phoneWhatsapp}`,
      `Preferred Schedule: ${payload.preferredSchedule}`,
      `Additional Notes: ${payload.additionalNotes || "N/A"}`,
    ].join("\n"),
  });

  return { delivered: true as const };
}
