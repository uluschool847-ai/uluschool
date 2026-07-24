import type { PrismaClient } from "@prisma/client";

import {
  DEFAULT_CATALOGUE_LEVELS,
  DEFAULT_CATALOGUE_SUBJECTS,
} from "@/lib/catalogue/default-catalogue";

export type ProductionCatalogueDatabase = Pick<PrismaClient, "level" | "subject">;

export async function bootstrapProductionCatalogue(database: ProductionCatalogueDatabase) {
  for (const level of DEFAULT_CATALOGUE_LEVELS) {
    await database.level.upsert({
      where: { slug: level.slug },
      update: {},
      create: { ...level },
    });
  }

  for (const subject of DEFAULT_CATALOGUE_SUBJECTS) {
    await database.subject.upsert({
      where: { slug: subject.slug },
      update: {},
      create: { ...subject },
    });
  }
}
