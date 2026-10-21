import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { FlowDefinitionSchema } from "@copilot/shared";
import type { DB } from "./connection.js";

const here = dirname(fileURLToPath(import.meta.url));
// src/db -> package root -> flows
const FLOWS_DIR = join(here, "..", "..", "flows");

const FLOW_FILES = ["invite-teammate.json", "ai-demo.json"];

const DEMO_TENANT = {
  id: "tenant_acme",
  name: "Acme",
  apiKey: "demo-key", // publishable (browser)
  secretKey: "demo-secret", // server-to-server (stats/admin)
};

/** Doc chunks grounding the AI plan compiler (id keeps seeding idempotent). */
const KNOWLEDGE = [
  {
    id: "k_invite",
    title: "Inviting teammates",
    content:
      "Open Settings from the sidebar, find the Members section, then click the Invite button inside Members (not the top-nav Invite). Enter the teammate's email and click Send invite. Only the section Invite button opens the invite dialog.",
  },
  {
    id: "k_nav",
    title: "App navigation",
    content:
      "The sidebar has Dashboard and Settings. Settings (/settings/members) contains the Members section with the member list and Invite. The Dashboard (/) shows projects and a Create project button. There is no billing or user-deletion page in this demo workspace.",
  },
  {
    id: "k_project",
    title: "Creating a project",
    content:
      "Go to the Dashboard from the sidebar and click the Create project button. Name the project and confirm. New projects appear in the dashboard list.",
  },
];

/** Idempotently seed the demo tenant + its flows. Safe to call on every boot. */
export function seed(db: DB): void {
  const now = Date.now();

  db.prepare(
    `INSERT OR IGNORE INTO tenants (id, name, api_key, secret_key, config_json, created_at)
     VALUES (?, ?, ?, ?, '{}', ?)`,
  ).run(DEMO_TENANT.id, DEMO_TENANT.name, DEMO_TENANT.apiKey, DEMO_TENANT.secretKey, now);
  // Existing dev databases predate the key split — backfill the secret.
  db.prepare("UPDATE tenants SET secret_key = ? WHERE id = ? AND secret_key IS NULL").run(
    DEMO_TENANT.secretKey,
    DEMO_TENANT.id,
  );

  for (const k of KNOWLEDGE) {
    db.prepare(
      `INSERT OR IGNORE INTO knowledge (id, tenant_id, title, content, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(k.id, DEMO_TENANT.id, k.title, k.content, now);
  }

  for (const file of FLOW_FILES) {
    const raw = JSON.parse(readFileSync(join(FLOWS_DIR, file), "utf8"));
    const def = FlowDefinitionSchema.parse(raw);
    db.prepare(
      `INSERT OR IGNORE INTO flows (id, tenant_id, key, name, definition_json, version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `f_${randomUUID()}`,
      DEMO_TENANT.id,
      def.key,
      def.name,
      JSON.stringify(def),
      def.version,
      now,
    );
  }
}
