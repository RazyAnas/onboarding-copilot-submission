/**
 * Companion styles — token-driven (every color/size/duration is a --cp-* custom
 * property set by ui/theme.ts), motion-first, host-isolated via shadow DOM.
 * Layout is fixed; tokens are the only customization surface.
 */
export const OVERLAY_CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: var(--cp-font); }

  @media (prefers-reduced-motion: reduce) {
    * { transition-duration: 1ms !important; animation-duration: 1ms !important; }
  }

  /* ---- Spotlight: the companion's gaze. Travels between targets. ---- */
  .spotlight {
    position: fixed;
    border-radius: 10px;
    box-shadow:
      0 0 0 2px var(--cp-accent),
      0 0 0 6px color-mix(in srgb, var(--cp-accent) 22%, transparent),
      0 0 24px 2px color-mix(in srgb, var(--cp-accent) 30%, transparent);
    pointer-events: none;
    z-index: 1;
    opacity: 1;
    transition: opacity var(--cp-motion-fast) var(--cp-ease);
  }
  /* Travel mode is enabled only when the TARGET changes (not while tracking). */
  .spotlight--travel {
    transition:
      top var(--cp-motion-travel) var(--cp-ease),
      left var(--cp-motion-travel) var(--cp-ease),
      width var(--cp-motion-travel) var(--cp-ease),
      height var(--cp-motion-travel) var(--cp-ease),
      opacity var(--cp-motion-fast) var(--cp-ease);
  }
  .spotlight--arrive { animation: cp-pulse 900ms var(--cp-ease) 1; }
  @keyframes cp-pulse {
    0%, 100% { box-shadow: 0 0 0 2px var(--cp-accent), 0 0 0 6px color-mix(in srgb, var(--cp-accent) 22%, transparent), 0 0 24px 2px color-mix(in srgb, var(--cp-accent) 30%, transparent); }
    40% { box-shadow: 0 0 0 2px var(--cp-accent), 0 0 0 12px color-mix(in srgb, var(--cp-accent) 14%, transparent), 0 0 32px 6px color-mix(in srgb, var(--cp-accent) 38%, transparent); }
  }

  .scrim {
    position: fixed; inset: 0; background: var(--cp-scrim);
    pointer-events: none; z-index: 0;
    opacity: 0; transition: opacity var(--cp-motion-base) var(--cp-ease);
  }
  .scrim--on { opacity: 1; }

  /* ---- The card: one surface, calm hierarchy. ---- */
  .card {
    position: fixed;
    width: 330px;
    background: var(--cp-surface);
    -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
    color: var(--cp-text);
    font-size: var(--cp-text-size); line-height: 1.55;
    border: 1px solid var(--cp-border);
    border-radius: var(--cp-radius);
    padding: var(--cp-pad);
    box-shadow: var(--cp-shadow);
    pointer-events: auto;
    z-index: 2;
    overflow: hidden;
    transition:
      top var(--cp-motion-travel) var(--cp-ease),
      left var(--cp-motion-travel) var(--cp-ease),
      opacity var(--cp-motion-base) var(--cp-ease),
      transform var(--cp-motion-base) var(--cp-ease);
    animation: cp-enter var(--cp-motion-base) var(--cp-ease) 1;
  }
  @keyframes cp-enter {
    from { opacity: 0; transform: translateY(8px) scale(0.98); }
    to { opacity: 1; transform: none; }
  }

  /* Hairline progress — ambient, not announced. */
  .card__progress {
    position: absolute; top: 0; left: 0; height: 2px;
    background: var(--cp-accent); border-radius: 0 2px 2px 0;
    transition: width 480ms var(--cp-ease);
  }

  .card__head {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: var(--cp-gap); min-height: 22px;
  }
  .card__badge {
    font-size: 12px; font-weight: 500; color: var(--cp-text-2);
    display: inline-flex; align-items: center; gap: 6px;
  }
  .card__badge .dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--cp-accent); display: inline-block;
    animation: cp-breathe 1.8s ease-in-out infinite;
  }
  @keyframes cp-breathe { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }

  /* Top controls recede until the user reaches for them. */
  .card__topctl { display: flex; gap: 2px; opacity: 0.45; transition: opacity var(--cp-motion-fast) var(--cp-ease); }
  .card:hover .card__topctl, .card:focus-within .card__topctl { opacity: 1; }
  .iconbtn {
    appearance: none; border: 0; background: transparent; color: var(--cp-text-2);
    font: 500 12px/1 var(--cp-font); padding: 5px 7px; border-radius: var(--cp-radius-sm);
    cursor: pointer; transition: background var(--cp-motion-fast) var(--cp-ease);
  }
  .iconbtn:hover { background: var(--cp-surface-2); color: var(--cp-text); }

  .card__title { font-weight: 600; margin: 0 0 2px; font-size: var(--cp-text-size); color: var(--cp-text-2); }
  .card__body {
    margin: 0; font-size: var(--cp-hero-size); font-weight: 500; color: var(--cp-text);
    letter-spacing: -0.006em;
    animation: cp-fadein var(--cp-motion-base) var(--cp-ease) 1;
  }
  @keyframes cp-fadein { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }

  .card__cta {
    margin-top: 12px; appearance: none; border: 0; border-radius: var(--cp-radius-sm);
    background: var(--cp-accent); color: var(--cp-on-accent);
    font: 600 13px/1 var(--cp-font); padding: 9px 13px; cursor: pointer;
  }

  .card__nav { display: flex; gap: var(--cp-gap); margin-top: 14px; align-items: center; }
  .card__nav .spacer { flex: 1; }
  .navbtn {
    appearance: none; border: 1px solid var(--cp-border); background: transparent;
    color: var(--cp-text-2); font: 550 13px/1 var(--cp-font);
    padding: 8px 12px; border-radius: var(--cp-radius-sm); cursor: pointer;
    transition: background var(--cp-motion-fast) var(--cp-ease), color var(--cp-motion-fast) var(--cp-ease);
  }
  .navbtn:hover { background: var(--cp-surface-2); color: var(--cp-text); }
  .navbtn--primary {
    background: var(--cp-accent); border-color: transparent; color: var(--cp-on-accent);
    box-shadow: 0 1px 6px color-mix(in srgb, var(--cp-accent) 40%, transparent);
  }
  .navbtn--primary:hover { background: color-mix(in srgb, var(--cp-accent) 88%, #000 12%); color: var(--cp-on-accent); }
  .navbtn[disabled] { opacity: 0.35; cursor: not-allowed; }

  .launcher {
    position: fixed; right: 18px; bottom: 18px;
    appearance: none; border: 0; border-radius: 999px;
    background: var(--cp-accent); color: var(--cp-on-accent);
    font: 600 13px/1 var(--cp-font); padding: 11px 16px; cursor: pointer;
    box-shadow: 0 8px 22px color-mix(in srgb, var(--cp-accent) 45%, transparent);
    pointer-events: auto; z-index: 3;
    animation: cp-enter var(--cp-motion-base) var(--cp-ease) 1;
  }
  .launcher:hover { transform: translateY(-1px); }

  /* ---- Checklist: the trust artifact. ---- */
  .card__stepstoggle {
    appearance: none; border: 0; background: transparent; color: var(--cp-text-3);
    font: 550 12px/1 var(--cp-font); padding: 8px 0 0; cursor: pointer; text-align: left;
    transition: color var(--cp-motion-fast) var(--cp-ease);
  }
  .card__stepstoggle:hover { color: var(--cp-text); }
  .card__steps { margin: 8px 0 0; padding: 0; list-style: none; }
  .card__steps .step {
    font-size: 13px; line-height: 1.8; color: var(--cp-text-3);
    animation: cp-fadein var(--cp-motion-base) var(--cp-ease) 1;
  }
  .card__steps .step--done { color: var(--cp-text-2); text-decoration: line-through; text-decoration-color: var(--cp-border); }
  .card__steps .step--current { color: var(--cp-text); font-weight: 600; }

  .card__skipreasons { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
  .chip {
    appearance: none; border: 1px solid var(--cp-border); background: transparent;
    color: var(--cp-text-2); font: 500 12px/1 var(--cp-font);
    padding: 6px 10px; border-radius: 999px; cursor: pointer;
    transition: background var(--cp-motion-fast) var(--cp-ease);
  }
  .chip:hover { background: var(--cp-surface-2); color: var(--cp-text); }

  /* ---- Celebration: the emotional peak gets its own state. ---- */
  .card--celebrate { text-align: center; padding: 22px var(--cp-pad); }
  .celebrate__check {
    width: 44px; height: 44px; margin: 2px auto 10px; display: block;
  }
  .celebrate__check circle {
    fill: color-mix(in srgb, var(--cp-accent) 14%, transparent);
    stroke: var(--cp-accent); stroke-width: 1.5;
  }
  .celebrate__check path {
    fill: none; stroke: var(--cp-accent); stroke-width: 3;
    stroke-linecap: round; stroke-linejoin: round;
    stroke-dasharray: 36; stroke-dashoffset: 36;
    animation: cp-draw 420ms var(--cp-ease) 160ms forwards;
  }
  @keyframes cp-draw { to { stroke-dashoffset: 0; } }

  .hidden { display: none !important; }
`;
