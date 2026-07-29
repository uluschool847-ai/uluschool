import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function verifyDatabase() {
  console.log("Verifying database state...");

  try {
    const [subjectCount, levelCount, adminCount] = await Promise.all([
      prisma.subject.count(),
      prisma.level.count(),
      prisma.appUser.count({
        where: { role: "ADMIN" },
      }),
    ]);

    await Promise.all([
      prisma.enquiry.findFirst({
        select: { consentVersion: true },
      }),
      prisma.pendingUpload.findFirst({
        select: { claimedAt: true },
      }),
    ]);

    if (subjectCount === 0 || levelCount === 0) {
      throw new Error(
        `Missing lookup data. Found ${subjectCount} Subjects and ${levelCount} Levels.`,
      );
    }

    if (adminCount === 0) {
      throw new Error("No ADMIN user found in the database.");
    }

    console.log("✅ Database verification successful!");
    console.log(
      `   State: ${adminCount} Admin(s), ${subjectCount} Subject(s), ${levelCount} Level(s).`,
    );
    process.exit(0);
  } catch (error) {
    console.error("❌ Database verification failed.");
    if (error instanceof Error) {
      console.error(`   Reason: ${error.message}`);
    } else {
      console.error(error);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verifyDatabase();
