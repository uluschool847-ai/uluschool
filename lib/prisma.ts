import { PrismaClient } from "@prisma/client";

declare global {
  var prismaClient: PrismaClient | undefined;
}

export const prisma =
  global.prismaClient ||
  new PrismaClient({
    log:
      (process.env.NODE_ENV ?? "development") === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if ((process.env.NODE_ENV ?? "development") !== "production") {
  global.prismaClient = prisma;
}
