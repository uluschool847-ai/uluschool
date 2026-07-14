import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  type ProductionAdminDatabase,
  bootstrapProductionAdmin,
} from "../lib/bootstrap/production-admin";

type BootstrapLogger = Pick<Console, "error" | "log">;
type BootstrapCliDatabase = ProductionAdminDatabase & {
  $disconnect(): Promise<void>;
};

export async function runProductionAdminBootstrap(
  environment: unknown,
  database: BootstrapCliDatabase,
  logger: BootstrapLogger = console,
) {
  let result: Awaited<ReturnType<typeof bootstrapProductionAdmin>>;
  let disconnectAttempted = false;

  try {
    result = await bootstrapProductionAdmin(environment, database);
    disconnectAttempted = true;
    await database.$disconnect();
  } catch {
    if (!disconnectAttempted) {
      try {
        disconnectAttempted = true;
        await database.$disconnect();
      } catch {
        // The CLI reports one generic failure for bootstrap and disconnect errors together.
      }
    }

    logger.error("Production admin bootstrap failed.");
    process.exitCode = 1;
    return;
  }

  logger.log(
    result.status === "created" ? "Production admin created." : "Production admin already exists.",
  );
}

async function runFromCommandLine() {
  try {
    const { prisma } = await import("../lib/prisma");
    await runProductionAdminBootstrap(process.env, prisma);
  } catch {
    console.error("Production admin bootstrap failed.");
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;

if (invokedPath === import.meta.url) {
  void runFromCommandLine();
}
