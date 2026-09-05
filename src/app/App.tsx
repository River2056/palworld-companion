import { lazy, Suspense, useEffect, useState, useRef } from 'react';
import { workspaceStore, type Workspace } from '../data/workspace';
import { Craft } from '../features/Craft';
import { Queue, Inventory } from '../features/Queue';
import { Settings } from '../features/Settings';
import type { TodayGuildSummary } from '../features/guild/GuildWorkspace';
import { Today } from '../features/Today';
import { useCatalogRuntime } from '../features/catalog-runtime';
import { PalWorkspace, BaseWorkspace } from '../features/pals';
import { PalBackupPanel } from '../features/pals/BackupPanel';

const GuildWorkspace = lazy(() => import('../features/guild').then(module => ({ default: module.GuildWorkspace })));
const destinations = ['Today', 'Craft', 'Breeding', 'Bases', 'Guild', 'Settings'] as const;
type Destination = typeof destinations[number];
function readDestination(): Destination {
  return destinations.find((name) => window.location.hash === `#/${name.toLowerCase()}`) ?? 'Today';
}

export default function App() {
  const {runtime,error:catalogError}=useCatalogRuntime();
  const [destination, setDestination] = useState(readDestination);
  const [guildOpened, setGuildOpened] = useState(() => readDestination() === 'Guild');
  const [guildSummary, setGuildSummary] = useState<TodayGuildSummary | null>(null);
  const [guildAuthenticated, setGuildAuthenticated] = useState(false);
  const [logoutSignal, setLogoutSignal] = useState(0);
  useEffect(() => { if (destination === 'Guild') setGuildOpened(true); }, [destination]);
  const [targetSpecies, setTargetSpecies] = useState<string>();
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
        <div className="sidebar-note"><span className="status-dot"/> Local-first by design<p>Personal plans stay in this browser.<br/>Guild connects only with your consent.</p></div>
      </aside>
      <main id="main-content" tabIndex={-1}>
        <header className="page-header"><div><p className="eyebrow">A little planning. More exploring.</p><h1>{destination}</h1></div><span className="badge"><span className="status-dot"/> {destination==='Guild'?'Optional shared workspace':'Personal workspace'}</span></header>
        <p className="catalog-status">{runtime?.selected ? `Catalog: ${runtime.selected.craft.recipes.length} reference recipes · ${runtime.selected.craft.items.filter(i=>i.kind==='raw').length} leaf materials · Game version: ${runtime.selected.manifest.gameVersion??'unverified'}` : catalogError||'Selected catalog unavailable; calculations require exact saved references.'}</p>
        {runtime?.selected&&<p className="warning">Selected reference: {runtime.selected.manifest.datasetId} · {runtime.selected.id} · {runtime.selected.manifest.verificationStatus}. Snapshot metadata is not a current-patch compatibility claim. Check source links against your game. {runtime.selected.manifest.notes?.join(' ')}</p>}
        {error&&<p role="alert">{error}</p>}
        {!data&&!error&&<p role="status">Loading local workspace…</p>}
        {destination!=='Guild'&&<p role="status" aria-live="polite">{busy?'Saving…':data?'Saved in this browser':''}</p>}
        {guildOpened&&<div hidden={destination!=='Guild'} inert={destination!=='Guild'} style={destination!=='Guild'?{display:'none'}:undefined}><Suspense fallback={<p role="status">Loading guild interface…</p>}><GuildWorkspace workspace={data} onSummary={setGuildSummary} onSession={setGuildAuthenticated} logoutSignal={logoutSignal}/></Suspense></div>}
        {data&&destination!=='Guild'&&<fieldset disabled={busy} className="workspace">
          {destination==='Today'&&<Today data={data} update={update} guildSummary={guildSummary} guildAuthenticated={guildAuthenticated} onGuildLogout={()=>{setGuildSummary(null);setGuildAuthenticated(false);setLogoutSignal(value=>value+1);}}/>}
          {destination==='Craft'&&<div className="stack"><Craft data={data} update={update}/><Queue data={data} update={update}/><Inventory data={data} update={update}/></div>}
          {destination==='Breeding'&&<PalWorkspace initialTargetSpeciesId={targetSpecies}/>}
          {destination==='Bases'&&<BaseWorkspace onTargetSpecies={id=>{setTargetSpecies(id);window.location.hash='#/breeding';}}/>}
          {destination==='Settings'&&<div className="stack"><Settings data={data} update={update}/><PalBackupPanel/></div>}
        </fieldset>}
        <footer className="page-footer"><span>Made for your next session, not another feed.</span><span>Unofficial fan companion · Not affiliated with Pocketpair</span><a href="/attribution.html">Data sources and licenses</a></footer>
      </main>
    </div>
  );
}
