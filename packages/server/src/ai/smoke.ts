/**
 * Manual live smoke for the configured AI provider. Not part of the test suite.
 * Run from the server package: `tsx src/ai/smoke.ts` (loads .env).
 */
import { loadConfig } from "../config.js";
import { createAiProvider } from "./index.js";

try {
  process.loadEnvFile();
} catch {
  /* no .env */
}

const provider = createAiProvider(loadConfig().ai);
console.log(`provider=${provider.name} isAi=${provider.isAi}`);

const decision = await provider.decide({
  goal: "Open the invite dialog from the Members section, not the top navigation",
  instruction: "Click Invite in the Members section.",
  flowName: "Invite a teammate",
  url: "http://acme.test/#/settings/members",
  stepId: "pick-invite",
  candidates: [
    { id: "topnav", role: "button", name: "Invite", text: "Invite", section: "Top navigation", testId: "topnav-invite", visible: true, enabled: true },
    { id: "members", role: "button", name: "Invite", text: "Invite", section: "Members", testId: "members-invite", visible: true, enabled: true },
  ],
});

console.log("decision:", JSON.stringify(decision, null, 2));
console.log(decision.targetElementId === "members" ? "✅ picked Members (correct)" : "⚠️ unexpected pick");
