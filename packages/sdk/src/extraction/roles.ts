/**
 * Pseudo-accessibility role resolution. We cannot read the browser's real
 * accessibility tree from page JS (the AOM never shipped), so we derive ARIA
 * roles from explicit role attributes and a subset of the implicit-role mapping.
 */

const LANDMARK_ROLES = new Set([
  "banner",
  "navigation",
  "main",
  "contentinfo",
  "complementary",
  "region",
  "search",
  "form",
  "dialog",
]);

/** Tags whose implicit role we map directly. */
const TAG_ROLE: Record<string, string> = {
  nav: "navigation",
  main: "main",
  header: "banner",
  footer: "contentinfo",
  aside: "complementary",
  button: "button",
  select: "combobox",
  textarea: "textbox",
  a: "link", // only when it has an href; handled below
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
  dialog: "dialog",
};

const INPUT_TYPE_ROLE: Record<string, string> = {
  checkbox: "checkbox",
  radio: "radio",
  search: "searchbox",
  email: "textbox",
  text: "textbox",
  tel: "textbox",
  url: "textbox",
  password: "textbox",
  number: "spinbutton",
  range: "slider",
  submit: "button",
  button: "button",
  reset: "button",
};

/** Resolve the element's role: explicit role attr wins, else implicit by tag/type. */
export function getRole(el: Element): string {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit.trim().split(/\s+/)[0]!;

  const tag = el.tagName.toLowerCase();

  if (tag === "a") return el.hasAttribute("href") ? "link" : "generic";
  if (tag === "input") {
    const type = (el.getAttribute("type") ?? "text").toLowerCase();
    return INPUT_TYPE_ROLE[type] ?? "textbox";
  }
  if (tag === "section") {
    // <section> is only a landmark ("region") when it has an accessible name.
    return el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby")
      ? "region"
      : "generic";
  }
  if (tag === "form") {
    return el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby")
      ? "form"
      : "generic";
  }
  return TAG_ROLE[tag] ?? "generic";
}

export function isLandmarkRole(role: string): boolean {
  return LANDMARK_ROLES.has(role);
}

/** Selector for elements we treat as primary interactive targets. */
export const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input:not([type=hidden])",
  "select",
  "textarea",
  "[role=button]",
  "[role=link]",
  "[role=tab]",
  "[role=menuitem]",
  "[role=checkbox]",
  "[role=radio]",
  "[role=switch]",
  "[role=option]",
  "[contenteditable=true]",
].join(",");
