/**
 * Accessible-name computation — a pragmatic subset of the W3C accname algorithm,
 * ordered by precedence. Mirrors closely enough what Chromium's a11y tree
 * produces for the element kinds we target (buttons, links, inputs, headings).
 */

function textFromIds(doc: Document, ids: string): string {
  return ids
    .split(/\s+/)
    .map((id) => doc.getElementById(id)?.textContent ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function associatedLabelText(el: HTMLElement): string {
  const doc = el.ownerDocument;
  const id = el.id;
  let text = "";
  if (id) {
    for (const label of doc.querySelectorAll(`label[for="${CSS.escape(id)}"]`)) {
      text += " " + (label.textContent ?? "");
    }
  }
  const wrapping = el.closest("label");
  if (wrapping) text += " " + (wrapping.textContent ?? "");
  return text.replace(/\s+/g, " ").trim();
}

export function getAccessibleName(el: Element): string {
  const doc = el.ownerDocument;

  // 1. aria-labelledby
  const labelledby = el.getAttribute("aria-labelledby");
  if (labelledby) {
    const t = textFromIds(doc, labelledby);
    if (t) return t;
  }

  // 2. aria-label
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel?.trim()) return ariaLabel.trim();

  const tag = el.tagName.toLowerCase();

  // 3. Associated <label> for form controls
  if (tag === "input" || tag === "select" || tag === "textarea") {
    const labelText = associatedLabelText(el as HTMLElement);
    if (labelText) return labelText;
  }

  // 4. Visible text content (buttons, links, headings, etc.)
  const content = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  if (content) return content;

  // 5. title
  const title = el.getAttribute("title");
  if (title?.trim()) return title.trim();

  // 6. Control-specific fallbacks
  if (tag === "input") {
    const placeholder = el.getAttribute("placeholder");
    if (placeholder?.trim()) return placeholder.trim();
    const value = (el as HTMLInputElement).value;
    if (value?.trim()) return value.trim();
  }
  const alt = el.getAttribute("alt");
  if (alt?.trim()) return alt.trim();

  return "";
}
