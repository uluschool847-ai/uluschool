import { prisma } from "@/lib/prisma";

// --- PageContent ---

export type CmsPageRecord = {
  id: string;
  slug: string;
  title: string;
  content: unknown;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export async function listPages() {
  return prisma.pageContent.findMany({
    orderBy: { updatedAt: "desc" },
  });
}

export async function listPublishedPages() {
  return prisma.pageContent.findMany({
    where: { isPublished: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getPage(id: string) {
  return prisma.pageContent.findUnique({
    where: { id },
  });
}

export async function getPageBySlug(slug: string) {
  return prisma.pageContent.findUnique({
    where: { slug },
  });
}

export async function getPublishedPageBySlug(slug: string) {
  return prisma.pageContent.findFirst({
    where: {
      slug,
      isPublished: true,
    },
  });
}

export async function createPage(data: { slug: string; title: string; content: any; isPublished: boolean }) {
  return prisma.pageContent.create({
    data,
  });
}

export async function updatePage(id: string, data: { slug?: string; title?: string; content?: any; isPublished?: boolean }) {
  return prisma.pageContent.update({
    where: { id },
    data,
  });
}

export async function deletePage(id: string) {
  return prisma.pageContent.delete({
    where: { id },
  });
}

// --- BlogPost ---

export async function listBlogPosts() {
  return prisma.blogPost.findMany({
    include: { author: { select: { fullName: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getBlogPost(id: string) {
  return prisma.blogPost.findUnique({
    where: { id },
  });
}

export async function createBlogPost(data: { slug: string; title: string; content: string; authorId: string; isPublished: boolean; publishedAt?: Date }) {
  return prisma.blogPost.create({
    data,
  });
}

export async function updateBlogPost(id: string, data: { slug?: string; title?: string; content?: string; isPublished?: boolean; publishedAt?: Date | null }) {
  return prisma.blogPost.update({
    where: { id },
    data,
  });
}

export async function deleteBlogPost(id: string) {
  return prisma.blogPost.delete({
    where: { id },
  });
}

// --- FaqItem ---

export async function listFaqItems() {
  return prisma.faqItem.findMany({
    orderBy: [{ category: "asc" }, { displayOrder: "asc" }],
  });
}

export async function getFaqItem(id: string) {
  return prisma.faqItem.findUnique({
    where: { id },
  });
}

export async function createFaqItem(data: { category: string; question: string; answer: string; displayOrder: number }) {
  return prisma.faqItem.create({
    data,
  });
}

export async function updateFaqItem(id: string, data: { category?: string; question?: string; answer?: string; displayOrder?: number }) {
  return prisma.faqItem.update({
    where: { id },
    data,
  });
}

export async function deleteFaqItem(id: string) {
  return prisma.faqItem.delete({
    where: { id },
  });
}
