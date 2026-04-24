"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, UserRole } from "@prisma/client";

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

// --- Page Actions ---

export async function savePageAction(formData: FormData) {
  await requireRole([UserRole.ADMIN]);
  
  const id = formData.get("id") as string | null;
  const rawSlug = String(formData.get("slug") || "");
  const slug = rawSlug.trim().toLowerCase();
  const title = formData.get("title") as string;
  const contentStr = formData.get("content") as string;
  const isPublished = formData.get("isPublished") === "true";
  const returnPath = id ? `/admin/cms/pages/${id}` : "/admin/cms/pages/new";

  if (!/^[a-z0-9-]+$/.test(slug)) {
    redirect(`${returnPath}?error=invalid-slug`);
  }
  
  let content = {};
  const normalizedContent = contentStr?.trim();

  if (normalizedContent) {
    try {
      content = JSON.parse(normalizedContent);
    } catch {
      redirect(`${returnPath}?error=invalid-json`);
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
      redirect(`${returnPath}?error=slug-taken`);
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
  
  const id = formData.get("id") as string | null;
  const slug = formData.get("slug") as string;
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;
  const isPublishedStr = formData.get("isPublished") as string;
  const isPublished = isPublishedStr === "true";
  
  const publishedAt = isPublished ? new Date() : null;

  if (id) {
    await updateBlogPost(id, { slug, title, content, isPublished, publishedAt });
  } else {
    // New blog post uses the current admin as the author
    await createBlogPost({ slug, title, content, authorId: session.uid, isPublished, publishedAt: publishedAt || undefined });
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
  
  const id = formData.get("id") as string | null;
  const category = formData.get("category") as string;
  const question = formData.get("question") as string;
  const answer = formData.get("answer") as string;
  const displayOrder = parseInt((formData.get("displayOrder") as string) || "0", 10);

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
