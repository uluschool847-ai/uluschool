import { Metadata } from "next";

export const siteConfig = {
  name: "mathSchool",
  description: "Advanced online mathematics education for ambitious students.",
  url: process.env.NEXT_PUBLIC_APP_URL || "https://mathschool.example.com",
};

export function constructMetadata({
  title = siteConfig.name,
  description = siteConfig.description,
  image = "/og-image.jpg",
  noIndex = false,
}: {
  title?: string;
  description?: string;
  image?: string;
  noIndex?: boolean;
} = {}): Metadata {
  return {
    title: {
      default: title,
      template: `%s | ${siteConfig.name}`,
    },
    description,
    openGraph: {
      title,
      description,
      images: [
        {
          url: image,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
      creator: "@mathschool",
    },
    robots: {
      index: !noIndex,
      follow: !noIndex,
    },
    metadataBase: new URL(siteConfig.url),
  };
}

export function generateStructuredData(type: "Organization" | "Course" | "Article", data: any) {
  if (type === "Organization") {
    return {
      "@context": "https://schema.org",
      "@type": "EducationalOrganization",
      "name": siteConfig.name,
      "description": siteConfig.description,
      "url": siteConfig.url,
      "logo": `${siteConfig.url}/logo.png`,
    };
  }

  if (type === "Course") {
    return {
      "@context": "https://schema.org",
      "@type": "Course",
      "name": data.name,
      "description": data.description,
      "provider": {
        "@type": "EducationalOrganization",
        "name": siteConfig.name,
        "sameAs": siteConfig.url
      }
    };
  }

  if (type === "Article") {
    return {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": data.title,
      "datePublished": data.publishedAt?.toISOString(),
      "author": {
        "@type": "Person",
        "name": data.authorName
      }
    };
  }
}
