import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  type ProductionAdminDatabase,
  bootstrapProductionAdmin,
} from "../lib/bootstrap/production-admin";

type BootstrapLogger = Pick<Console, "error" | "log">;
type BootstrapEnvironment = Record<string, string | undefined>;
type BootstrapCliDatabase = ProductionAdminDatabase & {
  $disconnect(): Promise<void>;
};

export async function runProductionAdminBootstrap(
  environment: BootstrapEnvironment,
  database: BootstrapCliDatabase,
  logger: BootstrapLogger = console,
) {
  let reportedFailure = false;
  const reportFailure = () => {
    if (!reportedFailure) {
      logger.error("Production admin bootstrap failed.");
      reportedFailure = true;
    }
    process.exitCode = 1;
  };

  try {
    const result = await bootstrapProductionAdmin(environment, database);
    logger.log(
      result.status === "created"
        ? "Production admin created."
        : "Production admin already exists.",
    );
  } catch {
    reportFailure();
  } finally {
    try {
      await database.$disconnect();
    } catch {
      reportFailure();
    }
  }
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
