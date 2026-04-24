import { PrismaClient, UserRole } from "@prisma/client";

import { hashPassword } from "../lib/auth/password";

const prisma = new PrismaClient();

async function main() {
  const defaultPortalPassword = process.env.DEFAULT_PORTAL_PASSWORD || "ChangeMe123!";
  const passwordHash = await hashPassword(defaultPortalPassword);
  const adminTwoFactorSecret = process.env.ADMIN_2FA_SECRET?.trim();

  const levels = [
    {
      slug: "primary-years-1-6",
      name: "Primary (Years 1-6)",
      description: "Strong foundations in literacy, numeracy, and scientific thinking.",
    },
    {
      slug: "lower-secondary-years-7-9",
      name: "Lower Secondary (Years 7-9)",
      description: "Skill-based preparation for IGCSE across core Cambridge subjects.",
    },
    {
      slug: "igcse-years-10-11",
      name: "IGCSE (Years 10-11)",
      description: "Exam preparation aligned with Cambridge standards.",
    },
  ];

  const subjects = [
    {
      slug: "mathematics",
      name: "Mathematics",
      description: "Core Cambridge mathematics pathway.",
    },
    {
      slug: "english",
      name: "English",
      description: "Reading, writing, grammar, and comprehension.",
    },
    {
      slug: "english-language",
      name: "English Language",
      description: "IGCSE English language skills and exam preparation.",
    },
    { slug: "science", name: "Science", description: "Integrated science for primary level." },
    {
      slug: "global-perspectives",
      name: "Global Perspectives",
      description: "Research, critical thinking, and communication skills.",
    },
    {
      slug: "biology",
      name: "Biology",
      description: "Cambridge biology for secondary and exam levels.",
    },
    {
      slug: "chemistry",
      name: "Chemistry",
      description: "Conceptual and practical chemistry mastery.",
    },
    {
      slug: "physics",
      name: "Physics",
      description: "Physics problem solving and exam technique.",
    },
    {
      slug: "geography",
      name: "Geography",
      description: "Cambridge geography concepts, case studies, and exam practice.",
    },
    {
      slug: "ict",
      name: "ICT",
      description: "Digital literacy and ICT coursework support.",
    },
    {
      slug: "business-studies",
      name: "Business Studies",
      description: "IGCSE business concepts, analysis, and exam preparation.",
    },
    {
      slug: "kiswahili",
      name: "Kiswahili",
      description: "Language learning with reading, writing, and communication practice.",
    },
  ];

  for (const level of levels) {
    await prisma.level.upsert({
      where: { slug: level.slug },
      update: level,
      create: level,
    });
  }

  for (const subject of subjects) {
    await prisma.subject.upsert({
      where: { slug: subject.slug },
      update: subject,
      create: subject,
    });
  }

  const users = [
    {
      email: "admin@uluglobalacademy.com",
      fullName: "ULU Admin",
      role: UserRole.ADMIN,
      phoneWhatsapp: "+254700111111",
    },
    {
      email: "teacher@uluglobalacademy.com",
      fullName: "Grace Wambui",
      role: UserRole.TEACHER,
      phoneWhatsapp: "+254700222222",
    },
    {
      email: "parent@uluglobalacademy.com",
      fullName: "Parent Account",
      role: UserRole.PARENT,
      phoneWhatsapp: "+254700333333",
    },
    {
      email: "student@uluglobalacademy.com",
      fullName: "Student Account",
      role: UserRole.STUDENT,
      phoneWhatsapp: "+254700444444",
    },
  ];

  for (const user of users) {
    const isAdmin = user.role === UserRole.ADMIN;
    await prisma.appUser.upsert({
      where: { email: user.email },
      update: {
        fullName: user.fullName,
        role: user.role,
        phoneWhatsapp: user.phoneWhatsapp,
        passwordHash,
        isActive: true,
        twoFactorEnabled: isAdmin ? Boolean(adminTwoFactorSecret) : false,
        twoFactorSecret: isAdmin ? adminTwoFactorSecret || null : null,
        twoFactorBackupCodes: [],
      },
      create: {
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        phoneWhatsapp: user.phoneWhatsapp,
        passwordHash,
        twoFactorEnabled: isAdmin ? Boolean(adminTwoFactorSecret) : false,
        twoFactorSecret: isAdmin ? adminTwoFactorSecret || null : null,
        twoFactorBackupCodes: [],
      },
    });
  }

  const teacher = await prisma.appUser.findUniqueOrThrow({
    where: { email: "teacher@uluglobalacademy.com" },
    select: { id: true },
  });

  const parent = await prisma.appUser.findUniqueOrThrow({
    where: { email: "parent@uluglobalacademy.com" },
    select: { id: true },
  });

  const student = await prisma.appUser.findUniqueOrThrow({
    where: { email: "student@uluglobalacademy.com" },
    select: { id: true },
  });

  const now = new Date();
  const classOneStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 15, 0, 0);
  const classOneEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 16, 0, 0);
  const classTwoStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 17, 0, 0);
  const classTwoEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 18, 0, 0);

  const schedule = [
    {
      title: "IGCSE Mathematics - Algebra",
      description: "Live algebra problem-solving session.",
      startAt: classOneStart,
      endAt: classOneEnd,
      liveLessonUrl: "https://meet.google.com/",
      teacherId: teacher.id,
      participantUserIds: [student.id, parent.id],
    },
    {
      title: "IGCSE Biology - Cell Structure",
      description: "Interactive class with revision questions.",
      startAt: classTwoStart,
      endAt: classTwoEnd,
      liveLessonUrl: "https://meet.google.com/",
      teacherId: teacher.id,
      participantUserIds: [student.id, parent.id],
    },
  ];

  await prisma.reminderLog.deleteMany();
  await prisma.scheduledClass.deleteMany();
  await prisma.scheduledClass.createMany({
    data: schedule,
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
