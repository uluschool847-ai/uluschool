import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const session = await getSession();

  const response = session
    ? {
        authenticated: true,
        user: {
          uid: session.uid,
          email: session.email,
          fullName: session.fullName ?? null,
          role: session.role,
        },
      }
    : { authenticated: false };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
