import type { SemanticElement } from "../schemas/element.js";
import { SemanticElementSchema } from "../schemas/element.js";
import type { DeltaGroup, PageSnapshot } from "../schemas/snapshot.js";

/** Minimum number of structurally-identical siblings before delta-encoding pays off. */
export const MIN_GROUP_SIZE = 3;

/**
 * Structural signature: elements sharing this are candidates for one delta group.
 * Deliberately excludes per-instance varying fields (id, text, bbox, ordinal…).
 */
function signature(el: SemanticElement): string {
  return JSON.stringify([
    el.role,
    el.tag,
    el.sectionRole,
    el.parentChain,
    Object.keys(el.aria).sort(),
  ]);
}

function buildGroup(members: SemanticElement[]): DeltaGroup {
  const keys = Object.keys(members[0]!) as (keyof SemanticElement)[];
  const template: Record<string, unknown> = {};
  const varyingKeys: string[] = [];

  for (const k of keys) {
    const firstJson = JSON.stringify(members[0]![k]);
    const allSame = members.every((m) => JSON.stringify(m[k]) === firstJson);
    if (allSame) template[k] = members[0]![k];
    else varyingKeys.push(k as string);
  }

  const instances = members.map((m) => {
    const inst: Record<string, unknown> = {};
    for (const k of varyingKeys) inst[k] = m[k as keyof SemanticElement];
    return inst;
  });

  return { template, varyingKeys, instances };
}

/**
 * Split a flat element list into plainly-encoded elements plus delta groups for
 * any run of >= MIN_GROUP_SIZE structurally-identical siblings.
 */
export function encodeElements(elements: SemanticElement[]): {
  elements: SemanticElement[];
  deltaGroups: DeltaGroup[];
} {
  const groups = new Map<string, SemanticElement[]>();
  const order: string[] = [];

  for (const el of elements) {
    const sig = signature(el);
    let bucket = groups.get(sig);
    if (!bucket) {
      bucket = [];
      groups.set(sig, bucket);
      order.push(sig);
    }
    bucket.push(el);
  }

  const plain: SemanticElement[] = [];
  const deltaGroups: DeltaGroup[] = [];

  for (const sig of order) {
    const members = groups.get(sig)!;
    if (members.length < MIN_GROUP_SIZE) plain.push(...members);
    else deltaGroups.push(buildGroup(members));
  }

  return { elements: plain, deltaGroups };
}

/**
 * Reconstitute the full element list from a snapshot, validating each
 * decoded element. Accepts plain-only, delta-only, or mixed snapshots
 * (backward compatible).
 */
export function decodeSnapshot(snapshot: PageSnapshot): SemanticElement[] {
  const out: SemanticElement[] = [...snapshot.elements];
  for (const group of snapshot.deltaGroups ?? []) {
    for (const inst of group.instances) {
      const merged = { ...group.template, ...inst };
      out.push(SemanticElementSchema.parse(merged));
    }
  }
  return out;
}
