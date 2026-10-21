interface Props {
  onInvite: () => void;
}

/**
 * Top navigation. Note the "Invite" button here is a DUPLICATE of the one in the
 * Members section — the canonical disambiguation hazard. It lives in a <nav>
 * landmark so section context can tell them apart.
 */
export function TopNav({ onInvite }: Props) {
  return (
    <nav className="topnav" aria-label="Top navigation">
      <span className="topnav__brand">Acme Workspace</span>
      <span className="topnav__spacer" />
      <button className="btn btn--ghost" data-testid="topnav-invite" onClick={onInvite}>
        Invite
      </button>
      <button className="btn" aria-label="Account menu">
        AB
      </button>
    </nav>
  );
}
