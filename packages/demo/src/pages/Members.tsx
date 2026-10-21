interface Props {
  onInvite: () => void;
}

const MEMBERS = [
  { name: "Ada Lovelace", email: "ada@acme.com", role: "Owner" },
  { name: "Alan Turing", email: "alan@acme.com", role: "Admin" },
  { name: "Grace Hopper", email: "grace@acme.com", role: "Member" },
  { name: "Katherine Johnson", email: "katherine@acme.com", role: "Member" },
  { name: "Margaret Hamilton", email: "margaret@acme.com", role: "Member" },
];

/**
 * Members settings. The "Invite" button here is the INTENDED target for the
 * "Invite teammate" flow — it must be chosen over the identical top-nav button.
 * The members table provides a run of structurally-identical rows for delta
 * compression and for the "repeated siblings" hazard.
 */
export function Members({ onInvite }: Props) {
  return (
    <div className="content">
      <h1>Settings</h1>
      <section className="section" aria-labelledby="members-heading">
        <div className="section__head">
          <h2 id="members-heading">Members</h2>
          <button className="btn" data-testid="members-invite" onClick={onInvite}>
            Invite
          </button>
        </div>
        <table aria-label="Team members">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {MEMBERS.map((m) => (
              <tr key={m.email}>
                <td>{m.name}</td>
                <td>{m.email}</td>
                <td>{m.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
