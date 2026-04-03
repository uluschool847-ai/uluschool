import type { Metadata } from "next";
import Link from "next/link";

import { siteConfig } from "@/lib/content";

import { ContactForm } from "@/components/contact/contact-form";
import { FaqSection } from "@/components/sections/faq-section";
import { PageHero } from "@/components/sections/page-hero";
import { SafeguardingSection } from "@/components/sections/safeguarding-section";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact ULU Online School for admissions, trial classes, and Cambridge curriculum enquiries.",
};

export default function ContactPage() {
  return (
    <>
      <PageHero
        title="Contact Us"
        description="Speak with our team about admissions, curriculum pathways, fees, and free trial class availability."
      />
      <section className="section-shell">
        <div className="container grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <div className="rounded-xl border bg-card p-6">
            <h2 className="text-xl font-semibold">Contact Details</h2>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>Email: {siteConfig.contact.email}</li>
              <li>Phone: {siteConfig.contact.phone}</li>
              <li>WhatsApp: {siteConfig.contact.whatsapp}</li>
              <li>Response Time: Within 24 hours on business days</li>
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/admissions">Apply Now</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/enrol">Book Free Trial Class</Link>
              </Button>
            </div>
          </div>

          <ContactForm />
        </div>
      </section>
      <FaqSection />
      <SafeguardingSection />
    </>
  );
}
