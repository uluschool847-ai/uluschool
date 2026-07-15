import { PrismaClient, UserRole } from "@prisma/client";

import { hashPassword } from "../lib/auth/password";

const prisma = new PrismaClient();

function isLoopbackDatabaseUrl(value: string | undefined) {
  if (!value) return false;

  try {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

async function main() {
  const seedPortalPassword = process.env.SEED_PORTAL_PASSWORD ?? "ChangeMe123!";
  const passwordHash = await hashPassword(seedPortalPassword);
  const shouldSeedInitialPasswordFixture = isLoopbackDatabaseUrl(process.env.DATABASE_URL ?? "");
  const initialPassword = process.env.E2E_INITIAL_PASSWORD ?? "C5InitialStudent123!";
  const adminTwoFactorSecret = (process.env.ADMIN_2FA_SECRET ?? "").trim();
  const seedLiveLessonUrl = process.env.SEED_LIVE_LESSON_URL ?? "https://meet.google.com/";
  const seedHomeworkContentUrl =
    process.env.SEED_HOMEWORK_CONTENT_URL ?? "https://example.com/homework.pdf";
  const seedMaterialFileUrl =
    process.env.SEED_MATERIAL_FILE_URL ?? "https://example.com/seeded-physics.pdf";

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
      id: "subject-123",
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
    const { id, ...subjectData } = subject as typeof subject & { id?: string };
    await prisma.subject.upsert({
      where: { slug: subjectData.slug },
      update: subjectData,
      create: {
        ...(id ? { id } : {}),
        ...subjectData,
      },
    });
  }

  const mathSubject = await prisma.subject.findUniqueOrThrow({ where: { slug: "mathematics" } });
  const mathSubjectId = mathSubject.id;

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
      email: "teacher2@uluglobalacademy.com",
      fullName: "David Otieno",
      role: UserRole.TEACHER,
      phoneWhatsapp: "+254700666666",
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
    {
      email: "student2@uluglobalacademy.com",
      fullName: "Student Two",
      role: UserRole.STUDENT,
      phoneWhatsapp: "+254700555555",
    },
    {
      email: "freshstudent@uluglobalacademy.com",
      fullName: "Fresh Student",
      role: UserRole.STUDENT,
    },
    {
      email: "newteacher@uluglobalacademy.com",
      fullName: "New Teacher",
      role: UserRole.TEACHER,
    },
    {
      email: "onboardingparent@uluglobalacademy.com",
      fullName: "Onboarding Parent",
      role: UserRole.PARENT,
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
        id: (user as { id?: string }).id,
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

  const fixedUsers = [
    {
      id: "admin-123",
      email: "fixed.admin@uluglobalacademy.com",
      fullName: "Fixed Admin",
      role: UserRole.ADMIN,
    },
    {
      id: "teacher-123",
      email: "fixed.teacher@uluglobalacademy.com",
      fullName: "Fixed Teacher",
      role: UserRole.TEACHER,
    },
    {
      id: "teacher-456",
      email: "fixed.teacher2@uluglobalacademy.com",
      fullName: "Fixed Teacher Two",
      role: UserRole.TEACHER,
    },
    {
      id: "parent-123",
      email: "fixed.parent@uluglobalacademy.com",
      fullName: "Fixed Parent",
      role: UserRole.PARENT,
    },
    {
      id: "student-101",
      email: "fixed.student@uluglobalacademy.com",
      fullName: "Fixed Student",
      role: UserRole.STUDENT,
    },
    {
      id: "student-102",
      email: "fixed.student2@uluglobalacademy.com",
      fullName: "Fixed Student Two",
      role: UserRole.STUDENT,
    },
  ];

  for (const user of fixedUsers) {
    const existingEmailOwner = await prisma.appUser.findUnique({
      where: { email: user.email },
      select: { id: true },
    });

    if (existingEmailOwner && existingEmailOwner.id !== user.id) {
      await prisma.appUser.delete({
        where: { id: existingEmailOwner.id },
      });
    }

    await prisma.appUser.upsert({
      where: { id: user.id },
      update: {
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        passwordHash,
        isActive: true,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: [],
      },
      create: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        passwordHash,
        isActive: true,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: [],
      },
    });
  }

  if (shouldSeedInitialPasswordFixture) {
    const initialStudent = {
      id: "student-initial-setup-123",
      email: "fixed.initial.student@uluglobalacademy.com",
      fullName: "Fixed Initial Student",
    };
    const initialPasswordHash = await hashPassword(initialPassword);
    const existingEmailOwner = await prisma.appUser.findUnique({
      where: { email: initialStudent.email },
      select: { id: true },
    });

    if (existingEmailOwner && existingEmailOwner.id !== initialStudent.id) {
      await prisma.appUser.delete({ where: { id: existingEmailOwner.id } });
    }

    await prisma.appUser.upsert({
      where: { id: initialStudent.id },
      update: {
        email: initialStudent.email,
        fullName: initialStudent.fullName,
        role: UserRole.STUDENT,
        passwordHash: initialPasswordHash,
        isActive: true,
        mustChangePassword: true,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: [],
      },
      create: {
        ...initialStudent,
        role: UserRole.STUDENT,
        passwordHash: initialPasswordHash,
        isActive: true,
        mustChangePassword: true,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: [],
      },
    });
  }

  const teacherData = [
    {
      fullName: "Jane Doe",
      title: "Mathematics Teacher",
      bio: "Cambridge mathematics specialist with over 8 years of online teaching experience. Passionate about helping students master IGCSE and A-Level Mathematics.",
      photoUrl: null,
      displayOrder: 1,
      yearsExperience: 8,
      isActive: true,
      cabinetUserId: "teacher-123",
      subjectSlugs: ["mathematics"],
    },
    {
      fullName: "John Smith",
      title: "Physics & Science Teacher",
      bio: "Experienced Cambridge Physics and Combined Science educator. Focuses on building strong conceptual understanding through live interactive lessons.",
      photoUrl: null,
      displayOrder: 2,
      yearsExperience: 10,
      isActive: true,
      subjectSlugs: ["physics", "science"],
    },
    {
      fullName: "Alice Brown",
      title: "English Language Teacher",
      bio: "Cambridge English Language specialist with a focus on developing strong writing and comprehension skills for IGCSE and A-Level students.",
      photoUrl: null,
      displayOrder: 3,
      yearsExperience: 6,
      isActive: true,
      subjectSlugs: ["english-language"],
    },
  ];

  await prisma.teacher.deleteMany();
  for (const teacherProfile of teacherData) {
    const { subjectSlugs, ...teacherDataRecord } = teacherProfile;
    const teacher = await prisma.teacher.create({
      data: teacherDataRecord,
    });
    if (subjectSlugs.length > 0) {
      const subjectRecords = await prisma.subject.findMany({
        where: { slug: { in: subjectSlugs } },
        select: { id: true, slug: true },
      });
      await prisma.teacherSubject.createMany({
        data: subjectRecords.map((subject) => ({
          teacherId: teacher.id,
          subjectId: subject.id,
        })),
      });
    }
  }
  console.log(`Seeded ${teacherData.length} teachers`);

  const teacher = await prisma.appUser.findUniqueOrThrow({
    where: { id: "teacher-123" },
    select: { id: true },
  });

  const parent = await prisma.appUser.findUniqueOrThrow({
    where: { id: "parent-123" },
    select: { id: true },
  });

  const student = await prisma.appUser.findUniqueOrThrow({
    where: { id: "student-101" },
    select: { id: true },
  });

  const student2 = await prisma.appUser.findUniqueOrThrow({
    where: { id: "student-102" },
    select: { id: true },
  });

  const now = new Date();
  const classOneStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 15, 0, 0);
  const classOneEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 16, 0, 0);
  const classTwoStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 17, 0, 0);
  const classTwoEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 18, 0, 0);

  const schedule = [
    {
      id: "class-123",
      title: "IGCSE Mathematics - Algebra",
      description: "Live algebra problem-solving session.",
      startAt: classOneStart,
      endAt: classOneEnd,
      liveLessonUrl: seedLiveLessonUrl,
      teacherId: teacher.id,
      participantUserIds: [student.id, student2.id],
    },
    {
      id: "class-456",
      title: "IGCSE Biology - Cell Structure",
      description: "Interactive class with revision questions.",
      startAt: classTwoStart,
      endAt: classTwoEnd,
      liveLessonUrl: seedLiveLessonUrl,
      teacherId: teacher.id,
      participantUserIds: [student.id, student2.id],
    },
    {
      id: "class-empty-1",
      title: "Upcoming Workshop",
      description: "Empty state class with 0 enrolled students.",
      startAt: classTwoStart,
      endAt: classTwoEnd,
      liveLessonUrl: seedLiveLessonUrl,
      teacherId: teacher.id,
      participantUserIds: [],
    },
  ];

  await prisma.$transaction([
    prisma.reminderLog.deleteMany(),
    prisma.submission.deleteMany(),
    prisma.assignment.deleteMany(),
    prisma.scheduledClass.deleteMany(),
    prisma.studentProgress.deleteMany(),
    prisma.managerTask.deleteMany(),
    prisma.paymentTransaction.deleteMany(),
    prisma.studentSubscription.deleteMany(),
    prisma.contactLead.deleteMany(),
    prisma.enquiry.deleteMany(),
    prisma.faqItem.deleteMany(),
    prisma.blogPost.deleteMany(),
  ]);

  let submissionIndex = 0;
  for (const s of schedule) {
    const cls = await prisma.scheduledClass.create({
      data: {
        id: s.id,
        title: s.title,
        description: s.description,
        startAt: s.startAt,
        endAt: s.endAt,
        liveLessonUrl: s.liveLessonUrl,
        teacherId: s.teacherId,
        students: {
          connect: s.participantUserIds.map((id) => ({ id })),
        },
      },
    });

    if (s.participantUserIds.length > 0) {
      const assignment = await prisma.assignment.create({
        data: {
          ...(s.id === "class-123" ? { id: "assignment-789" } : {}),
          title: `Homework for ${s.title}`,
          description: "Complete the exercises",
          dueDate: s.endAt,
          scheduledClassId: cls.id,
          teacherId: s.teacherId,
          subjectId: mathSubjectId,
        },
      });

      await prisma.submission.create({
        data: {
          studentId: student.id,
          assignmentId: assignment.id,
          contentUrl: seedHomeworkContentUrl,
          grade: submissionIndex === 0 ? 95.5 : null,
        },
      });
      submissionIndex++;
    }
  }

  await prisma.courseMaterial.create({
    data: {
      id: "mat-123",
      title: "Seeded Physics Handout",
      description: "Initial seeded material for update/delete tests.",
      fileUrl: seedMaterialFileUrl,
      scheduledClassId: "class-123",
      teacherId: "teacher-123",
    },
  });

  // --- CMS & Marketing ---
  await prisma.blogPost.create({
    data: {
      slug: "why-cambridge-curriculum",
      title: "Why the Cambridge Curriculum is Best for Your Child",
      content: "The Cambridge curriculum provides a strong foundation for future success.",
      authorId: teacher.id,
      isPublished: true,
      publishedAt: new Date(),
    },
  });

  await prisma.faqItem.createMany({
    data: [
      { category: "Admissions", question: "How do I apply?", answer: "Click the apply button." },
      {
        category: "Academics",
        question: "What subjects are offered?",
        answer: "We offer Math, English, and Sciences.",
      },
      {
        category: "Support",
        question: "Is tutoring available?",
        answer: "Yes, 1-on-1 tutoring is available.",
      },
    ],
  });

  // --- CRM & Lead Generation ---
  const levelPrimary = await prisma.level.findFirstOrThrow();
  await prisma.enquiry.createMany({
    data: [
      {
        studentName: "John Doe Jr",
        ageYearLevel: "Year 5",
        subjects: ["Math"],
        curriculumLevelId: levelPrimary.id,
        parentGuardianName: "John Doe Sr",
        email: "johndoe@example.com",
        phoneWhatsapp: "+123456789",
        preferredSchedule: "Evenings",
        status: "NEW",
      },
      {
        studentName: "Jane Smith",
        ageYearLevel: "Year 8",
        subjects: ["Science"],
        curriculumLevelId: levelPrimary.id,
        parentGuardianName: "Bob Smith",
        email: "bob@example.com",
        phoneWhatsapp: "+987654321",
        preferredSchedule: "Weekends",
        status: "IN_PROGRESS",
      },
    ],
  });

  await prisma.contactLead.createMany({
    data: [
      {
        fullName: "Alice Lead",
        email: "alice@lead.com",
        message: "Interested in pricing.",
        status: "NEW",
      },
      {
        fullName: "Bob Lead",
        email: "bob@lead.com",
        message: "Do you have French?",
        status: "NEW",
      },
    ],
  });

  // --- Educational Graph Additions ---
  await prisma.studentProgress.create({
    data: {
      studentId: student.id,
      teacherId: teacher.id,
      subjectId: mathSubjectId,
      gradeLevel: "GOOD",
      teacherNotes: "Doing great in Algebra.",
    },
  });

  await prisma.managerTask.create({
    data: {
      title: "Follow up with John Doe",
      description: "Call regarding the recent enquiry.",
      dueDate: new Date(Date.now() + 86400000),
      assignedToId: "admin-123",
      status: "PENDING",
    },
  });

  // --- Billing & Monetization ---
  const subscription = await prisma.studentSubscription.create({
    data: {
      studentId: student.id,
      planName: "Premium Monthly",
      status: "ACTIVE",
      startDate: new Date(),
    },
  });

  await prisma.paymentTransaction.create({
    data: {
      subscriptionId: subscription.id,
      studentId: student.id,
      amount: 150.0,
      currency: "USD",
      status: "SUCCESS",
    },
  });

  // Explicitly link the Parent to the Student
  await prisma.appUser.update({
    where: { id: parent.id },
    data: {
      children: {
        connect: { id: student.id },
      },
    },
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
