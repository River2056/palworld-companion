import { useEffect, useState } from 'react';

const destinations = ['Today', 'Craft', 'Settings'] as const;
type Destination = typeof destinations[number];
function readDestination(): Destination {
  return destinations.find((name) => window.location.hash === `#/${name.toLowerCase()}`) ?? 'Today';
}

export default function App() {
  const [destination, setDestination] = useState(readDestination);
  useEffect(() => {
    const navigate = () => setDestination(readDestination());
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>Skip to content</a>
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark" aria-hidden="true">P</span><div>PALWORLD<span className="brand-subtitle">COMPANION / FIELD NOTES</span></div></div>
        <p className="section-label">Your workspace</p>
        <nav aria-label="Main navigation">
          {destinations.map((name, index) => <a key={name} href={`#/${name.toLowerCase()}`} aria-current={destination === name ? 'page' : undefined}><span aria-hidden="true" className="nav-number">0{index + 1}</span>{name}<span className="nav-arrow" aria-hidden="true">↗</span></a>)}
        </nav>
        <div className="upcoming"><p className="section-label">On the horizon</p><ul>{['Breeding', 'Base', 'Guild'].map((name) => <li key={name}><span>{name}</span><span className="upcoming-tag">Upcoming</span></li>)}</ul></div>
        <div className="sidebar-note"><span className="status-dot"/> Local-first by design<p>Your browser. Your plans.<br/>No account required.</p></div>
      </aside>
      <main id="main-content" tabIndex={-1}>
        <header className="page-header"><div><p className="eyebrow">A little planning. More exploring.</p><h1>{destination}</h1></div><span className="badge"><span className="status-dot"/> Personal workspace</span></header>
        {destination === 'Today' && <>
          <section className="hero" aria-labelledby="welcome-heading"><div className="hero-ornament" aria-hidden="true">✧</div><p className="eyebrow">Make room for the next adventure</p><h2 id="welcome-heading">Your next adventure starts here.</h2><p>A quiet place to organize what comes next.<br/>Start with your own progress, at your own pace.</p><span className="outline-label">Nothing to catch up on</span></section>
          <div className="card-grid"><section className="card"><p className="eyebrow">Your plan</p><h2>A clean slate</h2><p>No plans yet. This space is ready for your own plans, not sample game data.</p><div className="card-footer">Planning tools are on the way.</div></section><section className="card"><p className="eyebrow">How this works</p><h2>You are the source</h2><p>No game connection. All future progress will be entered manually in this browser.</p><div className="card-footer">No automatic save-file or server access.</div></section></div>
        </>}
        {destination === 'Craft' && <section className="card destination-card"><p className="eyebrow">Workspace preview</p><h2>Crafting workspace is not available yet.</h2><p>This foundation does not include recipes, resource calculations, or game data. Crafting tools will arrive in a later update.</p><span className="outline-label">Coming later</span></section>}
        {destination === 'Settings' && <section className="card destination-card"><p className="eyebrow">Privacy &amp; data</p><h2>Local first. Yours to manage.</h2><p>No account, telemetry, or cloud sync. This shell makes no requests to game services and currently stores no progress.</p><p>Future planning data is intended to stay in this browser and be entered manually. Browser storage can be cleared or lost; backup and export tools are not available yet.</p><p>This is not an offline-installed app yet: the local server must be running to load or reload it.</p></section>}
        <footer className="page-footer"><span>Made for your next session, not another feed.</span><span>Unofficial fan companion · Not affiliated with Pocketpair</span></footer>
      </main>
    </div>
  );
}
