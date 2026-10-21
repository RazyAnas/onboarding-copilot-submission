export function Dashboard() {
  return (
    <div className="content">
      <h1>Dashboard</h1>
      <section className="section" aria-label="Getting started">
        <div className="section__head">
          <h2>Getting started</h2>
        </div>
        <p>Welcome to Acme Workspace. Finish setting up your team to get going.</p>
        <button className="btn" data-testid="create-project">Create your first project</button>
      </section>
    </div>
  );
}
