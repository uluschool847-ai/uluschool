import type { AiProvider } from "@/lib/ai/ai-provider";
import { MockAiProvider } from "@/lib/ai/mock-ai-provider";

export function createAiProvider(): AiProvider {
  const provider = (process.env.AI_PROVIDER ?? "mock").toLowerCase();

  if (provider !== "mock") {
    throw new Error("Only AI_PROVIDER=mock is available in local mode.");
  }

  return new MockAiProvider();
}
