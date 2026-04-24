import type { Metadata } from "next";

import { PageHero } from "@/components/sections/page-hero";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy policy information for ULU Online School website visitors and enquiries.",
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <PageHero
        title="Privacy Policy"
        description="This policy explains exactly how ULU Online School collects, uses, stores, and protects personal data."
      />
      <section className="section-shell">
        <div className="container max-w-4xl space-y-4 text-sm text-muted-foreground">
          <p className="text-foreground">
            Effective date: April 21, 2026
          </p>
          <h2 className="text-xl font-semibold text-foreground">1. Data We Collect</h2>
          <p>
            We collect data submitted through Enrolment and Contact forms, including parent name,
            student name, class level, email, phone/WhatsApp, selected subjects, and message notes.
          </p>
          <h2 className="text-xl font-semibold text-foreground">2. Why We Collect It</h2>
          <p>
            We use this data to process applications, contact families, schedule classes, send class
            reminders, and improve admissions performance analytics.
          </p>
          <h2 className="text-xl font-semibold text-foreground">3. Legal Basis</h2>
          <p>
            We process data based on consent (form submission), legitimate educational operations,
            and compliance obligations where applicable.
          </p>
          <h2 className="text-xl font-semibold text-foreground">4. Sharing and Processors</h2>
          <p>
            We only share data with operational processors needed to run the service: hosting,
            managed database, email delivery, and security services. We do not sell personal data.
          </p>
          <h2 className="text-xl font-semibold text-foreground">5. Storage and Retention</h2>
          <p>
            Data is stored in protected systems and retained for admissions and student support
            operations. Records may be archived or deleted on request unless retention is required
            for legal reasons.
          </p>
          <h2 className="text-xl font-semibold text-foreground">6. Security Controls</h2>
          <p>
            We use role-based access controls, protected admin workflows, anti-spam validation,
            monitored infrastructure, and incident logging.
          </p>
          <h2 className="text-xl font-semibold text-foreground">7. Your Rights</h2>
          <p>
            You may request data access, correction, or deletion by contacting our admissions office
            at <strong>info@uluglobalacademy.com</strong>.
          </p>
          <h2 className="text-xl font-semibold text-foreground">8. International Access</h2>
          <p>
            ULU Online School serves international users. By using the platform, you understand that
            data may be processed in secure cloud infrastructure outside your home country.
          </p>
          <h2 className="text-xl font-semibold text-foreground">9. Policy Updates</h2>
          <p>
            We may update this policy when workflows or legal requirements change. Material updates
            will be published on this page with a revised effective date.
          </p>
        </div>
      </section>
    </>
  );
}
