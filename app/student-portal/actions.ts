"use server";

import { loginAction } from "@/app/portal/login/actions";
import { clearSession } from "@/lib/auth/session";
import type { LoginFormState } from "@/lib/validations/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function loginPortal(prevState: LoginFormState, formData: FormData) {
  return loginAction(prevState, formData);
}

export async function logoutPortal() {
  await clearSession();
  revalidatePath("/", "layout");
  redirect("/");
}
