import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/content";

export default function robots(): MetadataRoute.Robots {
  const isProduction = (process.env.APP_ENV ?? "") === "production";

  if (!isProduction) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
