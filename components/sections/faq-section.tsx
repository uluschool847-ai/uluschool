import { getPublishedFaqItems } from "@/lib/repositories/cms-repository";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export async function FaqSection() {
  const faqItems = (await getPublishedFaqItems()).filter((item) => item.status !== "draft");
  const defaultItem = faqItems[0]?.question;

  return (
    <section className="py-16">
      <div className="container max-w-4xl">
        <h2 className="text-3xl font-bold tracking-tight">Frequently Asked Questions</h2>
        {faqItems.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">
            No frequently asked questions available right now.
          </p>
        ) : (
          <Accordion type="single" collapsible defaultValue={defaultItem} className="mt-6">
            {faqItems.map((item) => (
              <AccordionItem key={item.id} value={item.question}>
                <AccordionTrigger>{item.question}</AccordionTrigger>
                <AccordionContent>{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </section>
  );
}
