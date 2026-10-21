/**
 * Pure placement scorer for the discovery dock (M9.6). Given the viewport and the
 * host's occupied edge rectangles, pick a slot that is visible and safe — the
 * principle being "visible > safe (no occlusion) > not support-coded". Bottom-center
 * is the first candidate, NOT a default: it only wins if it's actually clear.
 *
 * Pure geometry (no DOM) so it's unit-tested in isolation; the SDK supplies the
 * occupied rects via a thin DOM prober.
 */

export type PlacementAnchor =
  | "bottom-center"
  | "bottom-left"
  | "bottom-right"
  | "top-center"
  | "edge-right";

export interface PRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface PlacementResult {
  anchor: PlacementAnchor;
  /** CSS fixed offsets (px). `centerX` => left:50% + translateX(-50%). */
  bottom?: number;
  top?: number;
  left?: number;
  right?: number;
  centerX?: boolean;
}

export interface PlacementOpts {
  pillWidth?: number;
  pillHeight?: number;
  margin?: number;
  /** Anchors never to use. Bottom-right is excluded by default (support reflex). */
  exclude?: PlacementAnchor[];
  /** Candidate order, highest preference first. */
  order?: PlacementAnchor[];
}

const DEFAULT_ORDER: PlacementAnchor[] = [
  "bottom-center",
  "bottom-left",
  "top-center",
  "edge-right",
];

function intersects(a: PRect, b: PRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/** Height of a full-width-ish bar hugging the bottom edge (footer/nav/chat bar). */
function bottomBarHeight(vp: Viewport, occupied: PRect[]): number {
  let h = 0;
  for (const r of occupied) {
    const hugsBottom = r.y + r.height >= vp.height - 2;
    const wide = r.width >= vp.width * 0.5;
    if (hugsBottom && wide) h = Math.max(h, vp.height - r.y);
  }
  return h;
}

/** The pill's viewport rect for a candidate anchor, raised above any bottom bar. */
function rectFor(
  anchor: PlacementAnchor,
  vp: Viewport,
  pillW: number,
  pillH: number,
  margin: number,
  extraBottom: number,
): PRect {
  const bottomY = vp.height - margin - pillH - extraBottom;
  switch (anchor) {
    case "bottom-center":
      return { x: (vp.width - pillW) / 2, y: bottomY, width: pillW, height: pillH };
    case "bottom-left":
      return { x: margin, y: bottomY, width: pillW, height: pillH };
    case "bottom-right":
      return { x: vp.width - margin - pillW, y: bottomY, width: pillW, height: pillH };
    case "top-center":
      return { x: (vp.width - pillW) / 2, y: margin, width: pillW, height: pillH };
    case "edge-right":
      return { x: vp.width - 14, y: (vp.height - 64) / 2, width: 14, height: 64 };
  }
}

function toResult(anchor: PlacementAnchor, margin: number, extraBottom: number, vp: Viewport): PlacementResult {
  switch (anchor) {
    case "bottom-center":
      return { anchor, bottom: margin + extraBottom, centerX: true };
    case "bottom-left":
      return { anchor, bottom: margin + extraBottom, left: margin };
    case "bottom-right":
      return { anchor, bottom: margin + extraBottom, right: margin };
    case "top-center":
      return { anchor, top: margin, centerX: true };
    case "edge-right":
      return { anchor, right: 0, top: Math.max(8, (vp.height - 64) / 2) };
  }
}

/**
 * Choose the dock placement. Walks candidates in preference order, raising bottom
 * anchors above any detected bottom bar, and returns the first slot whose pill
 * rect collides with nothing. Falls back to the right-edge handle when the page
 * is too crowded for any pill slot.
 */
export function pickPlacement(
  vp: Viewport,
  occupied: PRect[],
  opts: PlacementOpts = {},
): PlacementResult {
  const pillW = opts.pillWidth ?? 220;
  const pillH = opts.pillHeight ?? 44;
  const margin = opts.margin ?? 16;
  const exclude = new Set(opts.exclude ?? ["bottom-right"]);
  const order = (opts.order ?? DEFAULT_ORDER).filter((a) => !exclude.has(a));
  const barH = bottomBarHeight(vp, occupied);

  for (const anchor of order) {
    const isBottom = anchor.startsWith("bottom");
    const extraBottom = isBottom ? barH : 0;
    const rect = rectFor(anchor, vp, pillW, pillH, margin, extraBottom);
    // Ignore the bottom bar itself (we already raised above it); test the rest.
    const hit = occupied.some((o) => intersects(rect, o));
    if (!hit) return toResult(anchor, margin, extraBottom, vp);
  }
  // Nothing clear — the near-zero-footprint handle as last resort.
  return toResult("edge-right", margin, 0, vp);
}
