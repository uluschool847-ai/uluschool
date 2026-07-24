import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Access denied",
  description: "The signed-in portal account does not have access to this area.",
};

export default function UnauthorizedPage() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl items-center px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Access denied</CardTitle>
          <CardDescription>
            Your account does not have permission to open this admin area.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/portal" prefetch={false}>
              Back to portal
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/portal/login">Sign in with another account</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
