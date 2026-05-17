"use server";

import { Prisma, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/session";
import { canCreateCmsPage } from "@/lib/cms/page-guard";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import {
  createBlogPost,
  createFaqItem,
  createPage,
  deleteBlogPost,
  deleteFaqItem,
  deletePage,
  getBlogPost,
  getFaqItem,
  getPage,
  updateBlogPost,
  updateFaqItem,
  updatePage,
} from "@/lib/repositories/cms-repository";

import { z } from "zod";

const pageSchema = z.object({
  id: z.string().optional().nullable(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, "Invalid slug format"),
  title: z.string().min(1, "Title is required"),
  contentStr: z.string().optional().nullable(),
  isPublished: z.boolean().default(false),
});

const blogPostSchema = z.object({
  id: z.string().optional().nullable(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, "Invalid slug format"),
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
  isPublished: z.boolean().default(false),
});

const faqItemSchema = z.object({
  id: z.string().optional().nullable(),
  category: z.string().min(1, "Category is required"),
  question: z.string().min(1, "Question is required"),
  answer: z.string().min(1, "Answer is required"),
  displayOrder: z.coerce.number().int().default(0),
});

function cmsPageSnapshot(page: {
  id: string;
  slug: string;
  title: string;
  content: unknown;
  isPublished: boolean;
}) {
  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    content: page.content,
    isPublished: page.isPublished,
  };
}

function cmsBlogPostSnapshot(post: {
  id: string;
  slug: string;
  title: string;
  content: string;
  authorId?: string | null;
  isPublished: boolean;
  publishedAt?: Date | null;
}) {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    content: post.content,
    authorId: post.authorId ?? null,
    isPublished: post.isPublished,
    publishedAt: post.publishedAt?.toISOString() ?? null,
  };
}

function cmsFaqItemSnapshot(faq: {
  id: string;
  category: string;
  question: string;
  answer: string;
  status?: string | null;
  displayOrder: number;
}) {
  return {
    id: faq.id,
    category: faq.category,
    question: faq.question,
    answer: faq.answer,
    status: faq.status ?? null,
    displayOrder: faq.displayOrder,
  };
}

// --- Page Actions ---

export async function savePageAction(formData: FormData) {
  const session = await requireRole([UserRole.ADMIN]);

  const rawInput = {
    id: formData.get("id")?.toString() || null,
    slug: formData.get("slug")?.toString() || "",
    title: formData.get("title")?.toString() || "",
    contentStr: formData.get("content")?.toString() || "",
    isPublished: formData.get("isPublished") === "true",
  };

  const parsed = pageSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }

  const { id, slug, title, contentStr, isPublished } = parsed.data;

  if (!canCreateCmsPage(slug)) {
    return {
      success: false,
      errors: {
        slug: ["This slug is reserved by a static route and cannot be managed in CMS."],
      },
    };
  }

  let content = {};
  if (contentStr) {
    try {
      content = JSON.parse(contentStr.trim());
    } catch {
      return { success: false, errors: { content: ["Invalid JSON format"] } };
    }
  }

  let previousPageSlug: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      if (id) {
        const existingPage = await getPage(id, tx);
        const updatedPage = await updatePage(id, { slug, title, content, isPublished }, tx);
        previousPageSlug = existingPage?.slug ?? null;
        await createAdminAuditLog(
          {
            adminUserId: session.uid,
            action: "CMS_PAGE_UPDATED",
            targetType: "cms_page",
            targetId: updatedPage.id,
            before: existingPage ? cmsPageSnapshot(existingPage) : null,
            after: cmsPageSnapshot(updatedPage),
            meta: { actorRole: UserRole.ADMIN, slug: updatedPage.slug },
          },
          tx,
        );
      } else {
        const createdPage = await createPage({ slug, title, content, isPublished }, tx);
        await createAdminAuditLog(
          {
            adminUserId: session.uid,
            action: "CMS_PAGE_CREATED",
            targetType: "cms_page",
            targetId: createdPage.id,
            before: null,
            after: cmsPageSnapshot(createdPage),
            meta: { actorRole: UserRole.ADMIN, slug: createdPage.slug },
          },
          tx,
        );
      }
    });

    if (previousPageSlug && previousPageSlug !== slug) {
      revalidatePath(`/pages/${previousPageSlug}`);
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { success: false, errors: { slug: ["Slug is already taken"] } };
    }
    throw error;
  }

  revalidatePath("/admin/cms/pages");
  revalidatePath("/pages");
  revalidatePath(`/pages/${slug}`);
  redirect("/admin/cms/pages");
}

export async function deletePageAction(formData: FormData) {
  const session = await requireRole([UserRole.ADMIN]);
  const id = formData.get("id") as string;
  if (id) {
    const deletedPage = await prisma.$transaction(async (tx) => {
      const page = await deletePage(id, tx);
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "CMS_PAGE_DELETED",
          targetType: "cms_page",
          targetId: page.id,
          before: cmsPageSnapshot(page),
          after: null,
          meta: { actorRole: UserRole.ADMIN, slug: page.slug },
        },
        tx,
      );
      return page;
    });
    revalidatePath("/admin/cms/pages");
    revalidatePath("/pages");
    revalidatePath(`/pages/${deletedPage.slug}`);
  }
}

// --- BlogPost Actions ---

export async function saveBlogPostAction(formData: FormData) {
  const session = await requireRole([UserRole.ADMIN]);

  const rawInput = {
    id: formData.get("id")?.toString() || null,
    slug: formData.get("slug")?.toString() || "",
    title: formData.get("title")?.toString() || "",
    content: formData.get("content")?.toString() || "",
    isPublished: formData.get("isPublished") === "true",
  };

  const parsed = blogPostSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }

  const { id, slug, title, content, isPublished } = parsed.data;
  let previousPostSlug: string | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      if (id) {
        const existingPost = await getBlogPost(id, tx);
        const publishedAt = isPublished ? (existingPost?.publishedAt ?? new Date()) : null;
        const updatedPost = await updateBlogPost(
          id,
          { slug, title, content, isPublished, publishedAt },
          tx,
        );
        previousPostSlug = existingPost?.slug ?? null;
        await createAdminAuditLog(
          {
            adminUserId: session.uid,
            action: "CMS_BLOG_UPDATED",
            targetType: "cms_blog_post",
            targetId: updatedPost.id,
            before: existingPost ? cmsBlogPostSnapshot(existingPost) : null,
            after: cmsBlogPostSnapshot(updatedPost),
            meta: { actorRole: UserRole.ADMIN, slug: updatedPost.slug },
          },
          tx,
        );
      } else {
        const publishedAt = isPublished ? new Date() : null;
        const createdPost = await createBlogPost(
          {
            slug,
            title,
            content,
            authorId: session.uid,
            isPublished,
            publishedAt: publishedAt || undefined,
          },
          tx,
        );
        await createAdminAuditLog(
          {
            adminUserId: session.uid,
            action: "CMS_BLOG_CREATED",
            targetType: "cms_blog_post",
            targetId: createdPost.id,
            before: null,
            after: cmsBlogPostSnapshot(createdPost),
            meta: { actorRole: UserRole.ADMIN, slug: createdPost.slug },
          },
          tx,
        );
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { success: false, errors: { slug: ["Slug is already taken"] } };
    }
    throw error;
  }

  revalidatePath("/admin/cms/blog");
  revalidatePath("/blog");
  revalidatePath(`/blog/${slug}`);
  if (previousPostSlug && previousPostSlug !== slug) {
    revalidatePath(`/blog/${previousPostSlug}`);
  }
  redirect("/admin/cms/blog");
}

export async function deleteBlogPostAction(formData: FormData) {
  const session = await requireRole([UserRole.ADMIN]);
  const id = formData.get("id") as string;
  if (id) {
    const deletedPost = await prisma.$transaction(async (tx) => {
      const post = await deleteBlogPost(id, tx);
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "CMS_BLOG_DELETED",
          targetType: "cms_blog_post",
          targetId: post.id,
          before: cmsBlogPostSnapshot(post),
          after: null,
          meta: { actorRole: UserRole.ADMIN, slug: post.slug },
        },
        tx,
      );
      return post;
    });
    revalidatePath("/admin/cms/blog");
    revalidatePath("/blog");
    revalidatePath(`/blog/${deletedPost.slug}`);
  }
}

// --- FaqItem Actions ---

export async function saveFaqItemAction(formData: FormData) {
  const session = await requireRole([UserRole.ADMIN]);

  const rawInput = {
    id: formData.get("id")?.toString() || null,
    category: formData.get("category")?.toString() || "",
    question: formData.get("question")?.toString() || "",
    answer: formData.get("answer")?.toString() || "",
    displayOrder: formData.get("displayOrder")?.toString() || "0",
  };

  const parsed = faqItemSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }

  const { id, category, question, answer, displayOrder } = parsed.data;

  await prisma.$transaction(async (tx) => {
    if (id) {
      const existingFaq = await getFaqItem(id, tx);
      const updatedFaq = await updateFaqItem(id, { category, question, answer, displayOrder }, tx);
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "CMS_FAQ_UPDATED",
          targetType: "cms_faq_item",
          targetId: updatedFaq.id,
          before: existingFaq ? cmsFaqItemSnapshot(existingFaq) : null,
          after: cmsFaqItemSnapshot(updatedFaq),
          meta: { actorRole: UserRole.ADMIN, category: updatedFaq.category },
        },
        tx,
      );
    } else {
      const createdFaq = await createFaqItem({ category, question, answer, displayOrder }, tx);
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "CMS_FAQ_CREATED",
          targetType: "cms_faq_item",
          targetId: createdFaq.id,
          before: null,
          after: cmsFaqItemSnapshot(createdFaq),
          meta: { actorRole: UserRole.ADMIN, category: createdFaq.category },
        },
        tx,
      );
    }
  });

  revalidatePath("/admin/cms/faq");
  revalidatePath("/");
  revalidatePath("/contact");
  revalidatePath("/faq");
  redirect("/admin/cms/faq");
}

export async function deleteFaqItemAction(formData: FormData) {
  const session = await requireRole([UserRole.ADMIN]);
  const id = formData.get("id") as string;
  if (id) {
    await prisma.$transaction(async (tx) => {
      const faq = await deleteFaqItem(id, tx);
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "CMS_FAQ_DELETED",
          targetType: "cms_faq_item",
          targetId: faq.id,
          before: cmsFaqItemSnapshot(faq),
          after: null,
          meta: { actorRole: UserRole.ADMIN, category: faq.category },
        },
        tx,
      );
    });
    revalidatePath("/admin/cms/faq");
    revalidatePath("/");
    revalidatePath("/contact");
    revalidatePath("/faq");
  }
}
