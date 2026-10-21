import { generateObject, streamText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  AiDecisionSchema,
  AiGuideDecisionSchema,
  type AiDecision,
  type AiGuideDecision,
} from "@copilot/shared";
import type {
  AiChatInput,
  AiDecisionInput,
  AiGuideInput,
  AuthorFlowInput,
  AiProvider,
} from "./provider.js";
import { AuthoredFlowSchema, type AuthoredFlow } from "./authored-flow.js";
import { buildPrompt, buildAuthorPrompt, buildGuidePrompt } from "./prompt.js";

/** AI SDK handles exponential backoff between these attempts. */
const MAX_RETRIES = 2;

const CHAT_SYSTEM =
  "You are an onboarding copilot embedded in a web app. Answer ONLY using the elements, sections, and documentation in the provided context. " +
  "Be concise (1-3 sentences) and concrete about on-screen actions, tailored to the user's CURRENT page: if they're already where they need to be, say so and continue from the next action — never send them somewhere they already are. " +
  "If the requested action cannot be done with what's in the context, say plainly that it isn't available in this app — do NOT invent a procedure or guess.";

/**
 * Gemini implementation, built on the Vercel AI SDK (`ai` + `@ai-sdk/google`).
 * The SDK gives Zod-validated structured output, automatic retries/backoff, and
 * provider portability — swapping vendors means changing only this file.
 */
export class GeminiProvider implements AiProvider {
  readonly isAi = true;
  private readonly google: ReturnType<typeof createGoogleGenerativeAI>;

  constructor(
    apiKey: string,
    readonly name = "gemini-2.5-flash",
  ) {
    this.google = createGoogleGenerativeAI({ apiKey });
  }

  private model() {
    return this.google(this.name);
  }

  async decide(input: AiDecisionInput): Promise<AiDecision> {
    const { object } = await generateObject({
      model: this.model(),
      schema: AiDecisionSchema,
      maxRetries: MAX_RETRIES,
      temperature: 0,
      prompt: buildPrompt(input),
    });
    return object;
  }

  async chat(input: AiChatInput): Promise<AsyncIterable<string>> {
    const convo = (input.history ?? [])
      .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
      .join("\n");
    const prompt =
      `${input.context}` +
      (convo ? `\n\nConversation so far:\n${convo}` : "") +
      `\n\nUser question: ${input.message}`;
    const result = streamText({
      model: this.model(),
      maxRetries: MAX_RETRIES,
      temperature: 0.3,
      system: CHAT_SYSTEM,
      prompt,
      // FAST path: chat is short, page-grounded Q&A — disable Gemini 2.5's default
      // "thinking" phase (which adds seconds of dead air before the first token).
      // Guide AUTHORING keeps its reasoning (the deep path).
      providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
    });
    return result.textStream;
  }

  async guide(input: AiGuideInput): Promise<AiGuideDecision> {
    const { object } = await generateObject({
      model: this.model(),
      schema: AiGuideDecisionSchema,
      maxRetries: MAX_RETRIES,
      temperature: 0,
      prompt: buildGuidePrompt(input),
    });
    return object;
  }

  async authorFlow(input: AuthorFlowInput): Promise<AuthoredFlow> {
    const { object } = await generateObject({
      model: this.model(),
      schema: AuthoredFlowSchema,
      maxRetries: MAX_RETRIES,
      temperature: 0,
      system:
        "You author step-by-step in-product guides. Use ONLY elements that exist (from the page candidates or the known app structure). Refer to elements by accessible name, section, or testid — NEVER invent CSS selectors or ids. If the goal is unrelated to this app or cannot be accomplished here, set feasible=false with a brief reason. Prefer advanceType 'manual' unless you are confident about the page transition.",
      prompt: buildAuthorPrompt(input),
    });
    return object;
  }
}
