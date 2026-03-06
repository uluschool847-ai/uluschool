export type PricingRequest = {
  level: string;
  subjectsCount: number;
  classFormat: "group" | "one_on_one" | "exam_package";
};

// Placeholder for future dynamic pricing rules and admin-editable configuration.
export function getPricingMessage(_request: PricingRequest): string {
  return "Contact us for pricing or book a free trial.";
}
