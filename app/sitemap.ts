import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/content";

export default function sitemap(): MetadataRoute.Sitemap {
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
    "/student-portal",
    "/subjects",
    "/teachers",
    "/terms-and-conditions",
    "/contact",
    "/enrol",
    "/pricing",
  ];

  return routes.map((route) => ({
    url: `${siteConfig.url}${route}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: route === "" ? 1 : 0.8,
  }));
}
