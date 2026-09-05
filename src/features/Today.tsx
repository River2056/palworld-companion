import type { WorkspaceProps } from './Craft';
import { Queue } from './Queue';
import { Shopping } from './Shopping';
import { catalog } from '../domain/catalog';
import { plan } from '../domain/planner';
export function Today(props:WorkspaceProps) {
 let summary='Plan blocked: edit unsafe quantities before calculating.';
 try {const p=plan(catalog,props.data.goals,props.data.stock);summary=`${props.data.goals.filter(g=>g.completed<g.quantity).length} active goals · ${props.data.goals.filter(g=>g.completed===g.quantity).length} completed · ${p.blocked.length} blocked · ${p.direct.filter(r=>r.missing>0).length} direct ingredient types missing`; }catch{/* Shopping shows recovery guidance. */}
 return <div className="stack"><section className="hero"><p className="eyebrow">Your next session</p><h2>A little planning. More exploring.</h2><p>{summary}</p><p>No game connection. All progress and inventory are manually entered in this browser.</p><a className="outline-label" href="#/craft">Find a recipe</a></section><Queue {...props}/><Shopping data={props.data}/></div>;
}
