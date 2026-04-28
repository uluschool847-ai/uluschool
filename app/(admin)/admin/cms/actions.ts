"use server";

import { Prisma, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/session";
import {
  createBlogPost,
  createFaqItem,
  createPage,
  deleteBlogPost,
  deleteFaqItem,
  deletePage,
  updateBlogPost,
  updateFaqItem,
  updatePage,
} from "@/lib/repositories/cms-repository";

import { z } from "zod";

const pageSchema = z.object({
  id: z.string().optional().nullable(),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/, "Invalid slug format"),
  title: z.string().min(1, "Title is required"),
  contentStr: z.string().optional().nullable(),
  isPublished: z.boolean().default(false),
});

const blogPostSchema = z.object({
  id: z.string().optional().nullable(),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/, "Invalid slug format"),
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

// --- Page Actions ---

export async function savePageAction(formData: FormData) {
  await requireRole([UserRole.ADMIN]);

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

  let content = {};
  if (contentStr) {
    try {
      content = JSON.parse(contentStr.trim());
    } catch {
      return { success: false, errors: { content: ["Invalid JSON format"] } };
    }
  }

  try {
    if (id) {
      await updatePage(id, { slug, title, content, isPublished });
    } else {
      await createPage({ slug, title, content, isPublished });
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
  await requireRole([UserRole.ADMIN]);
  const id = formData.get("id") as string;
  if (id) {
    await deletePage(id);
    revalidatePath("/admin/cms/pages");
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
  const publishedAt = isPublished ? new Date() : null;

  try {
    if (id) {
      await updateBlogPost(id, { slug, title, content, isPublished, publishedAt });
    } else {
      await createBlogPost({
        slug,
        title,
        content,
        authorId: session.uid,
        isPublished,
        publishedAt: publishedAt || undefined,
      });
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { success: false, errors: { slug: ["Slug is already taken"] } };
    }
    throw error;
  }

  revalidatePath("/admin/cms/blog");
  redirect("/admin/cms/blog");
}

export async function deleteBlogPostAction(formData: FormData) {
  await requireRole([UserRole.ADMIN]);
  const id = formData.get("id") as string;
  if (id) {
    await deleteBlogPost(id);
    revalidatePath("/admin/cms/blog");
  }
}

// --- FaqItem Actions ---

export async function saveFaqItemAction(formData: FormData) {
  await requireRole([UserRole.ADMIN]);

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

  if (id) {
    await updateFaqItem(id, { category, question, answer, displayOrder });
  } else {
    await createFaqItem({ category, question, answer, displayOrder });
  }

  revalidatePath("/admin/cms/faq");
  redirect("/admin/cms/faq");
}

export async function deleteFaqItemAction(formData: FormData) {
  await requireRole([UserRole.ADMIN]);
  const id = formData.get("id") as string;
  if (id) {
    await deleteFaqItem(id);
    revalidatePath("/admin/cms/faq");
  }
}
