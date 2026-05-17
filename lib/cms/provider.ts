export type CmsPage = {
  slug: string;
  title: string;
  body: string;
  updatedAt: string;
};

export interface CmsProvider {
  getPage(slug: string): Promise<CmsPage | null>;
}

/**
 * @deferred Reason: will be wired when the public page renderer switches from
 * direct Prisma reads to a pluggable headless CMS adapter.
 */
export const cmsProvider: CmsProvider = {
  async getPage(_slug: string) {
    return null;
  },
};
