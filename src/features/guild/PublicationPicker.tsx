import { useState } from 'react';
import type { PublicationSource } from './publication';
export function PublicationPicker({ guild, sources, disabled, onPublish }: { guild: string; sources: PublicationSource[]; disabled: boolean; onPublish: (source: PublicationSource) => void }) {
 const [selected,setSelected]=useState('');
 const source=sources.find(s=>s.requirement===selected);
 return <fieldset disabled={disabled}><legend>Copy one personal crafting source</legend><p>Direct ingredient shortages use your existing queue allocation. Pins copy the full goal quantity, not completed progress. No personal notes, inventory, or other goals are shared.</p><label>Personal source to copy<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose one pin or shortage</option>{sources.map(s=><option key={s.requirement} value={s.requirement}>{s.title} · {s.quantity} · {s.requirement}</option>)}</select></label>{!sources.length && <p>No active publishable sources. Pin a recipe in Craft first.</p>}{source && <Consent key={`${guild}:${JSON.stringify(source)}`} source={source} onPublish={onPublish}/>}</fieldset>;
}
function Consent({source,onPublish}:{source:PublicationSource;onPublish:(source:PublicationSource)=>void}) {
 const [consent,setConsent]=useState(false);
 return <><h4>Exact shared field preview</h4><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify({title:source.title,task_type:source.kind==='pin'?'craft':'gather',source_id:source.source,requested_quantity:source.quantity,delivered_quantity:0,status:'open',description:'',source_requirement_id:source.requirement,snapshot_checksum:source.checksum},null,2)}</pre><p>The server adds the selected guild, author, timestamps, revision and task identity. Existing requirement identities are deduplicated; publishing never updates existing work.</p><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>I consent to share exactly these fields with the selected guild</label><button disabled={!consent} onClick={()=>{setConsent(false);onPublish(source);}}>Publish selected source</button></>;
}
