import { describe, it, expect } from "vitest";
import { openDb } from "../db/connection.js";
import { seed } from "../db/seed.js";
import { createFlow } from "../db/repos.js";
import { retrieveFlowForGoal } from "../ai/retrieve.js";

describe("retrieval stays bounded at scale (ai:* cache excluded)", () => {
  it("ignores cached ai:* flows no matter how many accumulate", async () => {
    const db = openDb(":memory:");
    seed(db); // tenant_acme + authored invite-teammate + ai-demo

    // Simulate heavy usage: 500 cached AI-compiled flows pile up in the table.
    for (let i = 0; i < 500; i += 1) {
      const def = {
        key: `ai:junk-${i}`,
        name: `Junk flow ${i}`,
        version: 1,
        steps: [
          { id: "s0", goal: "junk", instruction: "junk", match: {}, advanceOn: { type: "manual" as const } },
        ],
      };
      createFlow(db, "tenant_acme", def, JSON.stringify(def));
    }

    const r = await retrieveFlowForGoal(db, "tenant_acme", "how do I invite a teammate");

    // Matches the AUTHORED flow, never a cached ai:* artifact…
    expect(r.match?.def.key).toBe("invite-teammate");
    // …and the corpus fed to the planner ("known paths") excludes all 500 ai:* rows,
    // so retrieval cost is fixed by the authored set, not by usage.
    expect(r.knownPaths.length).toBe(2);
    expect(r.knownPaths.some((p) => p.toLowerCase().includes("junk"))).toBe(false);

    db.close();
  });
});
