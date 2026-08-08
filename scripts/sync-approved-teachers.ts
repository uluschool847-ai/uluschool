import { UserRole } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { syncApprovedTeachers } from "../lib/services/sync-approved-teachers";

async function main() {
  if (process.env.APP_ENV !== "production") {
    throw new Error("Approved teacher synchronization requires APP_ENV=production.");
  }

  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail) {
    throw new Error("BOOTSTRAP_ADMIN_EMAIL is required to identify the audit actor.");
  }

  const actor = await prisma.appUser.findFirst({
    where: {
      email: { equals: adminEmail, mode: "insensitive" },
      role: UserRole.ADMIN,
      isActive: true,
    },
    select: { id: true },
  });
  if (!actor) {
    throw new Error("No active administrator matches BOOTSTRAP_ADMIN_EMAIL.");
  }

  const result = await syncApprovedTeachers({ actorId: actor.id });
  console.log(
    `Approved teacher synchronization complete: created=${result.created}, updated=${result.updated}, deleted=${result.deleted}.`,
  );
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Approved teacher synchronization failed.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
