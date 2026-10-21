import { createPortal } from "react-dom";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Rendered through a portal to document.body — exercises portal/modal targeting. */
export function InviteModal({ open, onClose }: Props) {
  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Invite teammate"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Invite teammate</h3>
        <label htmlFor="invite-email">Email address</label>
        <input
          id="invite-email"
          data-testid="invite-email"
          type="email"
          placeholder="teammate@acme.com"
        />
        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" data-testid="send-invite" onClick={onClose}>
            Send invite
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
