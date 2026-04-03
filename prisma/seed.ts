import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
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
