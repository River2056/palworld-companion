import { useEffect, useState, useRef } from 'react';
import { workspaceStore, type Workspace } from '../data/workspace';
import { Craft } from '../features/Craft';
import { Queue, Inventory } from '../features/Queue';
import { Settings } from '../features/Settings';
import { Today } from '../features/Today';
import { PalWorkspace, BaseWorkspace } from '../features/pals';

const destinations = ['Today', 'Craft', 'Breeding', 'Bases', 'Settings'] as const;
type Destination = typeof destinations[number];
function readDestination(): Destination {
  return destinations.find((name) => window.location.hash === `#/${name.toLowerCase()}`) ?? 'Today';
}

export default function App() {
  const [destination, setDestination] = useState(readDestination);
  const [data,setData]=useState<Workspace>();
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false); const writing=useRef(false);
  useEffect(()=>{workspaceStore.load().then(setData).catch(e=>setError(`Storage unavailable: ${e.message}. Existing data has not been overwritten.`));},[]);
  const update=async(next:Workspace)=>{
    if(writing.current) return false;
    writing.current=true;setBusy(true);setError('');
    try {await workspaceStore.save(next);setData(await workspaceStore.load());return true;}
    catch(e){setError(`Save failed: ${e instanceof Error?e.message:'storage error'}. Please retry.`);return false;}
    finally{writing.current=false;setBusy(false);}
  };
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
        <div className="upcoming"><p className="section-label">On the horizon</p><ul>{['Guild'].map((name) => <li key={name}><span>{name}</span><span className="upcoming-tag">Upcoming</span></li>)}</ul></div>
        <div className="sidebar-note"><span className="status-dot"/> Local-first by design<p>Your browser. Your plans.<br/>No account required.</p></div>
      </aside>
      <main id="main-content" tabIndex={-1}>
        <header className="page-header"><div><p className="eyebrow">A little planning. More exploring.</p><h1>{destination}</h1></div><span className="badge"><span className="status-dot"/> Personal workspace</span></header>
        <p className="catalog-status">Catalog: 10 reference recipes · 7 leaf materials · Game version: unverified</p>
        <p className="warning">Mixed-revision reference catalog, not current-game verified. Check recipe source links against your game. Station construction costs and alternate recipes excluded.</p>
        {error&&<p role="alert">{error}</p>}
        {!data&&!error&&<p role="status">Loading local workspace…</p>}
        <p role="status" aria-live="polite">{busy?'Saving…':data?'Saved in this browser':''}</p>
        {data&&<fieldset disabled={busy} className="workspace">
          {destination==='Today'&&<Today data={data} update={update}/>}
          {destination==='Craft'&&<div className="stack"><Craft data={data} update={update}/><Queue data={data} update={update}/><Inventory data={data} update={update}/></div>}
          {destination==='Breeding'&&<PalWorkspace/>}
          {destination==='Bases'&&<BaseWorkspace/>}
          {destination==='Settings'&&<Settings data={data} update={update}/>}
        </fieldset>}
        <footer className="page-footer"><span>Made for your next session, not another feed.</span><span>Unofficial fan companion · Not affiliated with Pocketpair</span></footer>
      </main>
    </div>
  );
}
