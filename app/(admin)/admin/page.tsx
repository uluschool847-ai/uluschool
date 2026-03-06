import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Admin",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminPlaceholderPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Admin Dashboard (Future)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>Prepared extension points:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Teacher management</li>
          <li>Editable pricing content</li>
          <li>CMS-backed page editing</li>
          <li>Enquiry review workflow</li>
        </ul>
      </CardContent>
    </Card>
  );
}
