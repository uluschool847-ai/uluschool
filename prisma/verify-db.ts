import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function verifyDatabase() {
  console.log("Verifying database state...");

  try {
    // 1. Check if the database is reachable and contains lookup data
    const subjectCount = await prisma.subject.count();
    const levelCount = await prisma.level.count();

    if (subjectCount === 0 || levelCount === 0) {
      throw new Error(
        `Missing lookup data. Found ${subjectCount} Subjects and ${levelCount} Levels.`
      );
    }

    // 2. Check for minimal required demo state (e.g., an Admin user)
    const adminCount = await prisma.appUser.count({
      where: { role: "ADMIN" },
    });

    if (adminCount === 0) {
      throw new Error("No ADMIN user found in the database.");
    }

    console.log("✅ Database verification successful!");
    console.log(
      `   State: ${adminCount} Admin(s), ${subjectCount} Subject(s), ${levelCount} Level(s).`
    );
    process.exit(0);
  } catch (error) {
    console.error("❌ Database verification failed.");
    if (error instanceof Error) {
      console.error(`   Reason: ${error.message}`);
    } else {
      console.error(error);
    }
    // Fail the script if the DB is empty, unreachable, or missing required state
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verifyDatabase();
