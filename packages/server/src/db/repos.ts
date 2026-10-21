import { randomUUID } from "node:crypto";
import type { DB } from "./connection.js";

export interface TenantRow {
  id: string;
  name: string;
  /** Publishable key — safe to embed in the browser SDK. */
  api_key: string;
  /** Secret key — server-to-server only (stats/admin). */
  secret_key: string | null;
  config_json: string;
  created_at: number;
}

export interface FlowRow {
  id: string;
  tenant_id: string;
  key: string;
  name: string;
  definition_json: string;
  version: number;
  created_at: number;
}

export interface SessionRow {
  id: string;
  tenant_id: string;
  flow_id: string;
  user_ref: string | null;
  current_step_id: string | null;
  state_json: string;
  status: string;
  created_at: number;
  updated_at: number;
}

export function getTenantByApiKey(db: DB, apiKey: string): TenantRow | undefined {
  return db.prepare("SELECT * FROM tenants WHERE api_key = ?").get(apiKey) as
    | TenantRow
    | undefined;
}

export function getTenantBySecretKey(db: DB, secretKey: string): TenantRow | undefined {
  if (!secretKey) return undefined;
  return db.prepare("SELECT * FROM tenants WHERE secret_key = ?").get(secretKey) as
    | TenantRow
    | undefined;
}

export function getFlowByKey(
  db: DB,
  tenantId: string,
  key: string,
): FlowRow | undefined {
  return db
    .prepare("SELECT * FROM flows WHERE tenant_id = ? AND key = ?")
    .get(tenantId, key) as FlowRow | undefined;
}

export function getFlowById(db: DB, id: string): FlowRow | undefined {
  return db.prepare("SELECT * FROM flows WHERE id = ?").get(id) as
    | FlowRow
    | undefined;
}

export function listFlows(db: DB, tenantId: string): FlowRow[] {
  return db
    .prepare("SELECT * FROM flows WHERE tenant_id = ? ORDER BY created_at ASC")
    .all(tenantId) as FlowRow[];
}

/**
 * Authored onboarding flows only — excludes `ai:*` cached compilation artifacts.
 * Retrieval/onboarding/warming scan THIS (a small, curated, fixed set), so the
 * corpus never grows with usage. The ai:* cache is still hit by exact key
 * (getFlowByKey), never scanned. This is what keeps retrieval bounded at scale.
 */
export function listAuthoredFlows(db: DB, tenantId: string): FlowRow[] {
  return db
    .prepare("SELECT * FROM flows WHERE tenant_id = ? AND key NOT LIKE 'ai:%' ORDER BY created_at ASC")
    .all(tenantId) as FlowRow[];
}

/** Flow ids the user (or the tenant, if no userRef) has a completed session for. */
export function completedFlowIds(db: DB, tenantId: string, userRef?: string): Set<string> {
  const rows = userRef
    ? (db
        .prepare(
          "SELECT DISTINCT flow_id FROM sessions WHERE tenant_id = ? AND status = 'completed' AND user_ref = ?",
        )
        .all(tenantId, userRef) as { flow_id: string }[])
    : (db
        .prepare("SELECT DISTINCT flow_id FROM sessions WHERE tenant_id = ? AND status = 'completed'")
        .all(tenantId) as { flow_id: string }[]);
  return new Set(rows.map((r) => r.flow_id));
}

/** Persist a flow definition (used by the AI plan compiler to cache authored guides). */
export function createFlow(
  db: DB,
  tenantId: string,
  def: { key: string; name: string; version: number },
  definitionJson: string,
): FlowRow {
  const row: FlowRow = {
    id: `f_${randomUUID()}`,
    tenant_id: tenantId,
    key: def.key,
    name: def.name,
    definition_json: definitionJson,
    version: def.version,
    created_at: Date.now(),
  };
  db.prepare(
    `INSERT INTO flows (id, tenant_id, key, name, definition_json, version, created_at)
     VALUES (@id, @tenant_id, @key, @name, @definition_json, @version, @created_at)`,
  ).run(row);
  return row;
}

/** Evict a flow (used by the self-healing plan cache; events keep the history). */
export function deleteFlow(db: DB, id: string): void {
  db.prepare("DELETE FROM flows WHERE id = ?").run(id);
}

export interface KnowledgeRow {
  id: string;
  tenant_id: string;
  title: string;
  content: string;
  created_at: number;
}

export function listKnowledge(db: DB, tenantId: string): KnowledgeRow[] {
  return db
    .prepare("SELECT * FROM knowledge WHERE tenant_id = ?")
    .all(tenantId) as KnowledgeRow[];
}

export function createSession(
  db: DB,
  input: {
    tenantId: string;
    flowId: string;
    currentStepId: string | null;
    userRef?: string;
    stateJson?: string;
  },
): SessionRow {
  const now = Date.now();
  const row: SessionRow = {
    id: `s_${randomUUID()}`,
    tenant_id: input.tenantId,
    flow_id: input.flowId,
    user_ref: input.userRef ?? null,
    current_step_id: input.currentStepId,
    state_json: input.stateJson ?? "{}",
    status: "active",
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO sessions (id, tenant_id, flow_id, user_ref, current_step_id, state_json, status, created_at, updated_at)
     VALUES (@id, @tenant_id, @flow_id, @user_ref, @current_step_id, @state_json, @status, @created_at, @updated_at)`,
  ).run(row);
  return row;
}

export function getSession(db: DB, id: string): SessionRow | undefined {
  return db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
    | SessionRow
    | undefined;
}

export function updateSession(
  db: DB,
  id: string,
  patch: { currentStepId: string | null; status: string; stateJson?: string },
): void {
  if (patch.stateJson !== undefined) {
    db.prepare(
      "UPDATE sessions SET current_step_id = ?, status = ?, state_json = ?, updated_at = ? WHERE id = ?",
    ).run(patch.currentStepId, patch.status, patch.stateJson, Date.now(), id);
  } else {
    db.prepare(
      "UPDATE sessions SET current_step_id = ?, status = ?, updated_at = ? WHERE id = ?",
    ).run(patch.currentStepId, patch.status, Date.now(), id);
  }
}

export function insertEvent(
  db: DB,
  input: { sessionId: string; type: string; payload?: unknown },
): void {
  db.prepare(
    "INSERT INTO events (session_id, type, payload_json, created_at) VALUES (?, ?, ?, ?)",
  ).run(
    input.sessionId,
    input.type,
    input.payload ? JSON.stringify(input.payload) : null,
    Date.now(),
  );
}
