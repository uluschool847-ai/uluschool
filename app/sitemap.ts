import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/content";
import { listPublishedPages } from "@/lib/repositories/cms-repository";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const routes = [
    "",
    "/about",
    "/admissions",
    "/blog",
    "/fees",
    "/curriculum",
    "/how-online-learning",
    "/privacy-policy",
    "/prospectus",
    "/results",
    "/subjects",
    "/teachers",
    "/terms-and-conditions",
    "/contact",
    "/enrol",
    "/pricing",
    "/pages",
  ];

  const staticRoutes: MetadataRoute.Sitemap = routes.map((route) => ({
    url: `${siteConfig.url}${route}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: route === "" ? 1 : 0.8,
  }));

  try {
    const publishedPages = await listPublishedPages();
    const cmsRoutes: MetadataRoute.Sitemap = publishedPages.map((page) => ({
      url: `${siteConfig.url}/pages/${page.slug}`,
      lastModified: page.updatedAt,
      changeFrequency: "weekly",
      priority: 0.7,
    }));

    return [...staticRoutes, ...cmsRoutes];
  } catch {
    return staticRoutes;
  }
}
