import { lazy, Suspense, useEffect, useState, useRef } from 'react';
import { liveQuery } from 'dexie';
import { workspaceStore, type Workspace } from '../data/workspace';

import { Craft } from '../features/Craft';
import { Queue, Inventory } from '../features/Queue';
import { Settings } from '../features/Settings';
import type { TodayGuildSummary } from '../features/guild/GuildWorkspace';
import { Today } from '../features/Today';
import { useCatalogRuntime } from '../features/catalog-runtime';
import { PalWorkspace, BaseWorkspace } from '../features/pals';
import { PalBackupPanel } from '../features/pals/BackupPanel';

// Read the replacement payload and its CAS token from the same IDB snapshot.
async function readWorkspaceRevision() {
  await workspaceStore.ready();
  return workspaceStore.transaction('r', workspaceStore.workspaces, workspaceStore.metadata, async () => ({
    data: await workspaceStore.load(),
    revision: (await workspaceStore.metadata.get('personal'))!.revision,
  }));
}
type WorkspaceRevision = Awaited<ReturnType<typeof readWorkspaceRevision>>;

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
  const [view,setView]=useState<WorkspaceRevision>();
  const data=view?.data;
  const latest=useRef<WorkspaceRevision|undefined>(undefined);
  const dirty=useRef(false);
  const [latestRevision,setLatestRevision]=useState<number>();
  const [editorEpoch,setEditorEpoch]=useState(0);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false); const writing=useRef(false);
  function receive(value:WorkspaceRevision,apply=false) {
    // An explicit refresh and liveQuery may complete in either order.
    if(latest.current && value.revision<latest.current.revision){if(apply)setView(latest.current);return;}
    latest.current=value;
    setLatestRevision(value.revision);
    if(apply||(!dirty.current&&!writing.current))setView(value);
  }
  useEffect(()=>{
    let active=true;
    let subscription:{unsubscribe():void}|undefined;
    const fail=(e:unknown)=>{if(active)setError(`Storage unavailable: ${e instanceof Error?e.message:String(e)}. Existing data has not been overwritten.`);};
    void workspaceStore.ready().then(()=>{
      if(active)subscription=liveQuery(readWorkspaceRevision).subscribe({next:value=>{if(active)receive(value);},error:fail});
    }).catch(fail);
    return ()=>{active=false;subscription?.unsubscribe();};
  },[]);
  const update=async(next:Workspace)=>{
    if(writing.current||!view)return false;
    // Capture the revision belonging to the rendered data, NEVER latest.current:
    // a live notification must not bless an older full-workspace replacement.
    const expectedRevision=view.revision;
    writing.current=true;setBusy(true);setError('');
    try {
      await workspaceStore.save(next,expectedRevision);
      dirty.current=false;
      receive(await readWorkspaceRevision(),true);
      return true;
    } catch(e) {
      dirty.current=true;
      setError(`Save failed: ${e instanceof Error?e.message:'storage error'}. Your draft is retained. If data changed, review the latest workspace before reapplying your edit; no automatic retry was made.`);
      // Refresh our coherent recovery snapshot without remounting dirty forms.
      try {receive(await readWorkspaceRevision());}catch{/* Keep the original save error and draft. */}
      return false;
    } finally{writing.current=false;setBusy(false);}
  };
  const reviewLatest=()=>{
    if(!latest.current||writing.current)return;
    dirty.current=false;setView(latest.current);setEditorEpoch(value=>value+1);setError('');
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
        {view&&latestRevision!==view.revision&&<p role="status">Local data changed. Your unsaved inputs are retained on the previous revision. <button disabled={busy} onClick={reviewLatest}>Review latest workspace (discard draft)</button></p>}
        {!data&&!error&&<p role="status">Loading local workspace…</p>}
        {destination!=='Guild'&&<p role="status" aria-live="polite">{busy?'Saving…':data?'Saved in this browser':''}</p>}
        {guildOpened&&<div hidden={destination!=='Guild'} inert={destination!=='Guild'} style={destination!=='Guild'?{display:'none'}:undefined}><Suspense fallback={<p role="status">Loading guild interface…</p>}><GuildWorkspace workspace={data} onSummary={setGuildSummary} onSession={setGuildAuthenticated} logoutSignal={logoutSignal}/></Suspense></div>}
        {data&&destination!=='Guild'&&<fieldset key={editorEpoch} disabled={busy} className="workspace" onInputCapture={()=>{dirty.current=true;}}>
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
