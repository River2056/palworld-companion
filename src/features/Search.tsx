import { useEffect, useMemo, useRef, useState } from 'react';
import Fuse from 'fuse.js';
import acquisitionReference from '../../docs/research/material-acquisition.json';
import type { DeepReadonly, ItemV2 } from '../domain/catalog-snapshot';
import { useCatalogRuntime } from './catalog-runtime';

type DetailedGuide = DeepReadonly<(typeof acquisitionReference.materials)[number]>;
const guides = new Map<string, DetailedGuide>(acquisitionReference.materials.map(guide => [guide.itemId, guide]));

export function Search() {
  const {runtime,error}=useCatalogRuntime();
  const [query,setQuery]=useState('');
  const [selectedId,setSelectedId]=useState('');
  const snapshot=runtime?.selected;
  const materials=useMemo(() => snapshot?.craft.items.filter(item=>item.kind==='raw')??[],[snapshot]);
  const index=useMemo(()=>new Fuse(materials.map(item=>({...item,aliases:[...(item.aliases??[]),item.id.replaceAll('-',' ')]})),{keys:['name','id','aliases'],threshold:0.35,ignoreLocation:true}),[materials]);
  if(!runtime)return <p role="status">{error||'Loading selected catalog…'}</p>;
  if(!snapshot)return <p role="alert">Selected catalog unavailable. Choose or import a catalog in Settings before searching materials.</p>;
  const matches=query.trim()?index.search(query.trim()).map(result=>result.item).slice(0,30):[];
  const selected=materials.find(item=>item.id===selectedId);
  return <div className="material-search stack">
    <section className="search-hero">
      <p className="eyebrow">Field guide / {materials.length} raw materials</p>
      <h2>Find the source, not just the recipe.</h2>
      <p>Search a raw material to see known Pal drops, habitat maps, merchants, Ranch production, and other source guidance.</p>
      <label>Search raw materials<input autoFocus value={query} placeholder="Try “ice organ”" onChange={event=>{setQuery(event.target.value);setSelectedId('');}} onKeyDown={event=>{if(event.key==='Escape')setSelectedId('');if(event.key==='ArrowDown'){event.preventDefault();document.querySelector<HTMLButtonElement>('.material-results button')?.focus();}}}/></label>
    </section>
    {!selected&&query.trim()&&<section className="material-results" aria-label="Material search results">
      {matches.map(item=><button key={item.id} aria-label={`Select ${item.name}`} onClick={()=>setSelectedId(item.id)}><span>{item.name}</span><small>{guides.has(item.id)?'Detailed field guide':'Source guidance'}</small></button>)}
      {!matches.length&&<p>No raw materials found. Try a partial name or check the spelling.</p>}
    </section>}
    {!selected&&!query.trim()&&<p className="search-prompt">Start with a material name. Craftable outputs remain in Craft.</p>}
    {selected&&<MaterialGuide item={selected} guide={guides.get(selected.id)}/>} 
  </div>;
}

function MaterialGuide({item,guide}:{item:DeepReadonly<ItemV2>;guide?:DetailedGuide}) {
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>heading.current?.focus(),[item.id]);
  return <section className="material-guide" aria-labelledby="material-guide-title">
    <div className="material-guide-heading"><div><p className="eyebrow">Acquisition field guide</p><h2 ref={heading} tabIndex={-1} id="material-guide-title">How to obtain {item.name}</h2></div><span className="method-count">{guide?`${guide.methods.length} methods`:'Source note'}</span></div>
    {guide?<div className="method-grid">{guide.methods.map(method=><article className={`method-card method-${method.type}`} key={method.id}>
      <p className="method-type">{method.type.replace('-', ' ')}</p><h3>{method.title}</h3><p>{method.summary}</p>
      {'pals' in method&&method.pals&&<ul className="pal-source-list">{method.pals.map(pal=><li key={pal.name}><div><strong>{pal.name}</strong><span>{pal.location}</span></div><div className="pal-yield">×{pal.quantity}<small>{pal.chance}</small></div><a href={pal.mapUrl} target="_blank" rel="noreferrer" aria-label={`${pal.name} map`}>Habitat map ↗</a></li>)}</ul>}
      {'location' in method&&method.location&&<p className="location-line"><span aria-hidden="true">⌖</span> {method.location}</p>}
      {'mapUrl' in method&&method.mapUrl&&<a className="map-link" href={method.mapUrl} target="_blank" rel="noreferrer" aria-label={`${method.title} location`}>Open map ↗</a>}
      <a className="source-link" href={method.sourceUrl} target="_blank" rel="noreferrer">Check source ↗</a>
    </article>)}</div>:<article className="method-card"><p className="method-type">Catalog guidance</p><h3>Known source note</h3>{item.acquisition?.length?<ul>{item.acquisition.map(note=><li key={note}>{note}</li>)}</ul>:<p>No acquisition details are available in this catalog.</p>}<a className="source-link" href={item.source.revision_url??item.source.url} target="_blank" rel="noreferrer">Check source ↗</a></article>}
    <p className="guide-caveat">Community reference data; game-version compatibility is unverified. Detailed guides currently cover selected materials, with catalog guidance available for all {item.kind==='raw'?'raw materials':'items'}.</p>
  </section>;
}
