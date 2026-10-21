import type { PageSnapshot, SemanticElement, TargetDescriptor } from "@copilot/shared";
import { extractSemanticElements } from "../extraction/extract.js";
import { buildPageSnapshot } from "../serialize.js";
import { resolveTarget } from "../matcher.js";

export interface ClickInfo {
  tag: string;
  text: string;
  testId?: string;
}

export interface HostStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/**
 * The host-integration boundary. Every direct touch of the browser environment —
 * DOM, history/route, storage, clock, element matching — lives behind this
 * interface, so the engine and orchestrator never hardcode `document`/`window`
 * and the core logic runs unchanged on any host site (or a headless/test host).
 */
export interface HostAdapter {
  now(): number;
  url(): string;
  extractElements(): SemanticElement[];
  buildSnapshot(): PageSnapshot;
  /** Resolve a resilient descriptor to a live element (matcher); null if absent. */
  resolveElement(d: TargetDescriptor): Element | null;
  /** Rect of the first element matching a CSS selector (demo highlight helper). */
  rectOf(selector: string): DOMRect | null;
  onRouteChange(cb: () => void): () => void;
  onMutation(cb: () => void): () => void;
  onClick(cb: (info: ClickInfo) => void): () => void;
  onInput(cb: () => void): () => void;
  readonly storage: HostStorage;
}

/** The SDK's own shadow hosts — never treated as host-page interactions. */
const SELF =
  "[data-copilot-overlay],[data-copilot-composer],[data-copilot-dock],[data-copilot-debug]";

/** Patch history + listen for route changes; returns a teardown fn. */
function installRouteHooks(onChange: () => void): () => void {
  const fire = () => onChange();
  window.addEventListener("popstate", fire);
  window.addEventListener("hashchange", fire);
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function (this: History, ...args) {
    const r = origPush.apply(this, args);
    fire();
    return r;
  };
  history.replaceState = function (this: History, ...args) {
    const r = origReplace.apply(this, args);
    fire();
    return r;
  };
  return () => {
    window.removeEventListener("popstate", fire);
    window.removeEventListener("hashchange", fire);
    history.pushState = origPush;
    history.replaceState = origReplace;
  };
}

/** The real browser host. Swap this implementation to run the core elsewhere. */
export function browserHost(): HostAdapter {
  return {
    now: () => performance.now(),
    url: () => location.href,
    extractElements: () => extractSemanticElements(document),
    buildSnapshot: () => buildPageSnapshot(document),
    resolveElement: (d) => resolveTarget(d, document)?.node ?? null,
    rectOf: (selector) => document.querySelector(selector)?.getBoundingClientRect() ?? null,
    onRouteChange: (cb) => installRouteHooks(cb),
    onMutation: (cb) => {
      const mo = new MutationObserver(() => cb());
      mo.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style", "disabled", "aria-hidden", "hidden"],
      });
      return () => mo.disconnect();
    },
    onClick: (cb) => {
      // Capture phase so a host's stopPropagation can't hide the click.
      const h = (e: MouseEvent) => {
        const el = (e.target as Element | null)?.closest?.(
          "button, a, [role='button'], input, [data-testid]",
        );
        if (!el || el.closest(SELF)) return;
        cb({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent ?? "").trim().slice(0, 40),
          testId: el.getAttribute("data-testid") ?? undefined,
        });
      };
      document.addEventListener("click", h, true);
      return () => document.removeEventListener("click", h, true);
    },
    onInput: (cb) => {
      // Typing changes a property, not an attribute — MutationObserver misses it.
      const h = () => cb();
      document.addEventListener("input", h, true);
      document.addEventListener("change", h, true);
      return () => {
        document.removeEventListener("input", h, true);
        document.removeEventListener("change", h, true);
      };
    },
    storage: {
      get: (k) => {
        try {
          return localStorage.getItem(k);
        } catch {
          return null;
        }
      },
      set: (k, v) => {
        try {
          localStorage.setItem(k, v);
        } catch {
          /* private mode — persistence disabled */
        }
      },
      remove: (k) => {
        try {
          localStorage.removeItem(k);
        } catch {
          /* ignore */
        }
      },
    },
  };
}
