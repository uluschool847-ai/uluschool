export type CmsPage = {
  slug: string;
  title: string;
  body: string;
  updatedAt: string;
};

export interface CmsProvider {
  getPage(slug: string): Promise<CmsPage | null>;
}

// Future implementation can target a headless CMS (Sanity, Contentful, Strapi, etc.).
export const cmsProvider: CmsProvider = {
  async getPage(_slug: string) {
    return null;
  },
};
