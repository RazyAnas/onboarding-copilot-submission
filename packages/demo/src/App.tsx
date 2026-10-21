import { useEffect, useRef, useState } from "react";
import { Copilot } from "@copilot/sdk";
import { useHashRoute } from "./router.js";
import { TopNav } from "./components/TopNav.js";
import { InviteModal } from "./components/InviteModal.js";
import { Dashboard } from "./pages/Dashboard.js";
import { Members } from "./pages/Members.js";

export function App() {
  const [route, navigate] = useHashRoute();
  const [modalOpen, setModalOpen] = useState(false);
  const [remountKey, setRemountKey] = useState(0);
  const copilot = useRef<Copilot | null>(null);

  useEffect(() => {
    copilot.current = Copilot.init({
      apiKey: "demo-key",
      flowKey: "invite-teammate",
      debug: true,
    });
    return () => copilot.current?.destroy();
  }, []);

  const isMembers = route.startsWith("/settings");

  return (
    <div className="app" key={remountKey}>
      <div className="main">
        <TopNav onInvite={() => setModalOpen(true)} />
        <div style={{ display: "flex" }}>
          <aside className="sidebar" aria-label="Primary">
            <a className={!isMembers ? "active" : ""} href="#/dashboard">
              Dashboard
            </a>
            <a className={isMembers ? "active" : ""} href="#/settings/members">
              Settings
            </a>
          </aside>
          {isMembers ? (
            <Members onInvite={() => setModalOpen(true)} />
          ) : (
            <Dashboard />
          )}
        </div>
      </div>

      <InviteModal open={modalOpen} onClose={() => setModalOpen(false)} />

      <div className="devbar">
        <strong>Copilot dev</strong>
        <button className="btn" onClick={() => copilot.current?.start()}>
          Start guide
        </button>
        <button className="btn" onClick={() => copilot.current?.pause()}>
          Pause
        </button>
        <button className="btn" onClick={() => copilot.current?.reset()}>
          Reset
        </button>
        <button
          className="btn"
          onClick={() =>
            copilot.current?.highlightSelector(
              '[data-testid="members-invite"]',
              {
                title: "Invite a teammate",
                body: "Click here to invite someone to your workspace.",
                cta: "Got it",
              },
              () => copilot.current?.clearHighlight(),
            )
          }
        >
          Highlight Members Invite
        </button>
        <button
          className="btn"
          onClick={() =>
            copilot.current?.highlightSelector('[data-testid="topnav-invite"]', {
              body: "This is the top-nav Invite (the duplicate).",
            })
          }
        >
          Highlight Top-nav Invite
        </button>
        <button className="btn" onClick={() => copilot.current?.clearHighlight()}>
          Clear
        </button>
        <button
          className="btn"
          onClick={async () => {
            const res = await copilot.current?.requestGuidance();
            console.info("[demo] guidance response:", res);
          }}
        >
          Send snapshot
        </button>
        <button className="btn" onClick={() => setRemountKey((k) => k + 1)}>
          Force remount
        </button>
        <button className="btn" onClick={() => navigate("/settings/members")}>
          Go to Members
        </button>
        <span>
          route: <code>{route}</code>
        </span>
      </div>
    </div>
  );
}
