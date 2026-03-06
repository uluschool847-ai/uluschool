import { faqItems } from "@/lib/content";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function FaqSection() {
  return (
    <section className="py-16">
      <div className="container max-w-4xl">
        <h2 className="text-3xl font-bold tracking-tight">Frequently Asked Questions</h2>
        <Accordion type="single" collapsible className="mt-6">
          {faqItems.map((item) => (
            <AccordionItem key={item.question} value={item.question}>
              <AccordionTrigger>{item.question}</AccordionTrigger>
              <AccordionContent>{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
