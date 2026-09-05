import reference from '../../../docs/research/pal-reference.json';
export const catalog = reference;
export type Gender = 'male' | 'female' | 'unknown';
export interface Pal { id:string; speciesId:string; nickname:string; gender:Gender; passives:string[]; notes:string; location:string; archived:boolean }
export interface RouteStep { id:string; pairId:string; childId:string; parents:[string,string]; conditional:boolean }
export interface BreedingRoute { id:string; targetId:string; steps:RouteStep[]; conditional:boolean; sourceVersion:string }
export interface SavedRoute extends BreedingRoute { completed:string[] }
export const speciesName = (id:string) => catalog.species.find(s=>s.id===id)?.name ?? id;
export function validatePal(p:Pal) {
 if (!p.id || !catalog.species.some(s=>s.id===p.speciesId) || !['male','female','unknown'].includes(p.gender)) throw new Error('Choose a supported species and valid gender.');
 if (p.nickname.length>100 || p.notes.length>4000 || p.location.length>200 || p.passives.join(',').length>1000) throw new Error('Pal text is too long (nickname 100, notes 4000, location 200, passives 1000).');
}
/** Explicit pair search only. Species ancestry prevents cycles; nodes retain individual parent identity. */
export function enumerateRoutes(roster:Pal[], targetId:string, maxSteps=4, limit=40):BreedingRoute[] {
 type Node={ref:string; gender:Gender; steps:RouteStep[]};
 if(!Number.isInteger(maxSteps)||maxSteps<1||!Number.isInteger(limit)||limit<1||limit>1000) throw new Error('Search bounds require positive whole numbers; maximum 1000 alternatives.');
 const bound=Math.min(6,maxSteps);
 function seek(species:string, ancestors:Set<string>):Node[] {
  const owned:Node[]=roster.filter(p=>!p.archived && p.speciesId===species).map(p=>({ref:`owned:${p.id}`,gender:p.gender,steps:[]}));
  if(ancestors.has(species)||ancestors.size>=bound) return owned;
  const next=new Set([...ancestors,species]); const nodes=[...owned];
  for(const pair of catalog.breedingPairs.filter(p=>p.childId===species)) {
   for(const a of seek(pair.parentIds[0],next)) for(const b of seek(pair.parentIds[1],next)) {
    if(a.ref===b.ref || (a.gender!=='unknown' && b.gender!=='unknown' && a.gender===b.gender)) continue;
    const prior=[...new Map([...a.steps,...b.steps].map(s=>[s.id,s])).values()];
    if(prior.length>=bound) continue;
    const id=`${pair.id}(${a.ref},${b.ref})`;
    const step:RouteStep={id,pairId:pair.id,childId:species,parents:[a.ref,b.ref],conditional:a.gender==='unknown'||b.gender==='unknown'};
    nodes.push({ref:`step:${id}`,gender:'unknown',steps:[...prior,step]});
    if(nodes.length>=limit) return nodes;
   }
  }
  return nodes;
 }
 return seek(targetId,new Set()).filter(n=>n.steps.length).slice(0,limit).map(n=>({id:n.ref,targetId,steps:n.steps,conditional:n.steps.some(s=>s.conditional),sourceVersion:catalog.catalogId}));
}
/** Validate graph shape without deleting legacy catalog IDs or missing owned-parent links. */
export function validateRoute(route:SavedRoute) {
 const invalid=()=>{throw new Error('Invalid route graph or checklist.');};
 if(!route || !route.id || !route.targetId || !route.sourceVersion || !Array.isArray(route.steps) || !route.steps.length || route.steps.length>6 || !Array.isArray(route.completed)) return invalid();
 const seen=new Set<string>();
 for(const step of route.steps) {
  if(!step || !step.id || seen.has(step.id) || !step.pairId || !step.childId || !Array.isArray(step.parents) || step.parents.length!==2 || step.parents[0]===step.parents[1]) return invalid();
  for(const ref of step.parents) {
   if(typeof ref!=='string' || !(ref.startsWith('owned:')&&ref.length>6 || ref.startsWith('step:')&&seen.has(ref.slice(5)))) return invalid();
  }
  seen.add(step.id);
 }
 if(route.steps[route.steps.length-1].childId!==route.targetId || new Set(route.completed).size!==route.completed.length || route.completed.some(id=>!seen.has(id))) return invalid();
}
export function routeWarnings(route:BreedingRoute,roster:Pal[]):string[] {
 const warnings:string[]=[];
 if(route.sourceVersion!==catalog.catalogId)warnings.push('Source version differs from the loaded reference.');
 if(!catalog.species.some(s=>s.id===route.targetId))warnings.push('Target species is unsupported in the loaded reference.');
 try {validateRoute({...route,completed:[]});} catch {warnings.push('Invalid saved route graph; select a new route.');}
 for(const [i,step] of route.steps.entries()) {
  const pair=catalog.breedingPairs.find(p=>p.id===step.pairId);
  if(!pair || pair.childId!==step.childId)warnings.push(`Step ${i+1}: breeding pair is unsupported or changed; select a new route.`);
  step.parents.forEach((ref,index)=>{
   if(!ref.startsWith('step:'))return;
   const prior=route.steps.slice(0,i).find(s=>s.id===ref.slice(5));
   if(!prior || pair&&prior.childId!==pair.parentIds[index])warnings.push(`Step ${i+1}: offspring parent reference is invalid or species changed.`);
   else warnings.push(`Step ${i+1}: confirm compatible offspring gender; checklist completion does not verify gender.`);
  });
  const parents=step.parents.map(ref=>ref.startsWith('owned:')?roster.find(p=>p.id===ref.slice(6)):undefined);
  step.parents.forEach((ref,index)=>{if(!ref.startsWith('owned:'))return;const p=parents[index];if(!p||p.archived)warnings.push(`Step ${i+1}: parent missing or archived.`);else if(pair&&p.speciesId!==pair.parentIds[index])warnings.push(`Step ${i+1}: parent species changed; select a new route.`);else if(p.gender==='unknown')warnings.push(`Step ${i+1}: confirm unknown parent gender.`);});
  if(parents[0]&&parents[1]&&parents[0].gender!=='unknown'&&parents[0].gender===parents[1].gender)warnings.push(`Step ${i+1}: parents are now the same sex; acquire another compatible parent.`);
 }
 return warnings;
}
export function parentGuidance(roster:Pal[], targetId:string):string[] {
 const pairs=catalog.breedingPairs.filter(p=>p.childId===targetId);
 if(!pairs.length) return ['No explicit pair for this target in this partial reference. Unsupported does not mean impossible.'];
 return pairs.map(pair=>{
  const missing=pair.parentIds.filter(id=>!roster.some(p=>!p.archived&&p.speciesId===id));
  return `${pair.parentIds.map(speciesName).join(' + ')}: ${missing.length ? `acquire or breed ${missing.map(speciesName).join(', ')}` : 'requires two distinct compatible-sex individuals; acquire another parent if both are the same sex'}.`;
 });
}
export interface WorkSlot { id:string; work:string; minimum:number; priority:number }
export interface Base { id:string; name:string; capacity:number; workerIds:string[]; slots:WorkSlot[] }
export const workTypes=Object.keys(catalog.species[0].workSuitability);
export function suitability(p:Pal,work:string):number { const levels=catalog.species.find(s=>s.id===p.speciesId)?.workSuitability; return levels ? (levels as Record<string,number>)[work]??0 : 0; }
export function validateBase(base:Base,bases:Base[],roster:Pal[]) {
 if(!base.id || !base.name.trim() || base.name.length>100) throw new Error('Base name is required (maximum 100 characters).');
 if(!Number.isInteger(base.capacity)||base.capacity<1||base.capacity>100) throw new Error('Capacity must be a whole number from 1 to 100.');
 if(new Set(base.workerIds).size!==base.workerIds.length || base.workerIds.length>base.capacity) throw new Error('Workers must be distinct and fit base capacity.');
 if(base.workerIds.some(id=>!roster.some(p=>p.id===id&&!p.archived))) throw new Error('Only active owned Pals may be assigned.');
 if(bases.some(b=>b.id!==base.id&&b.workerIds.some(id=>base.workerIds.includes(id)))) throw new Error('A Pal instance cannot work in two bases. Unassign it first.');
 if(base.slots.length>100 || new Set(base.slots.map(s=>s.id)).size!==base.slots.length || base.slots.some(s=>!s.id||!workTypes.includes(s.work)||!Number.isInteger(s.minimum)||s.minimum<1||s.minimum>10||!Number.isInteger(s.priority)||s.priority<1||s.priority>10)) throw new Error('Slots need supported work, minimum 1–10 and priority 1–10; maximum 100 distinct slots.');
}
export function analyzeBase(base:Base, roster:Pal[], bases:Base[]=[]) {
 const workers=roster.filter(p=>!p.archived&&base.workerIds.includes(p.id));
 const slots=[...base.slots].sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
 const assigned=new Map<string,WorkSlot>();
 function match(slot:WorkSlot,seen:Set<string>):boolean {
  for(const p of workers) { if(seen.has(p.id)||suitability(p,slot.work)<slot.minimum) continue; seen.add(p.id);
   const previous=assigned.get(p.id); if(!previous||match(previous,seen)){assigned.set(p.id,slot);return true;}
  } return false;
 }
 for(const slot of slots) match(slot,new Set());
 const filled=new Set([...assigned.values()].map(s=>s.id));
 const gaps=slots.filter(s=>!filled.has(s.id));
 const busy=new Set(bases.filter(b=>b.id!==base.id).flatMap(b=>b.workerIds));
 const replacements=gaps.flatMap(slot=>roster.filter(p=>!p.archived&&!base.workerIds.includes(p.id)&&!busy.has(p.id)&&suitability(p,slot.work)>=slot.minimum).map(p=>({palId:p.id,slotId:slot.id,score:slot.priority*100+suitability(p,slot.work),reason:`${slot.work} ${suitability(p,slot.work)} meets minimum ${slot.minimum}; priority ${slot.priority}. ${base.workerIds.length>=base.capacity?'Replace an assigned worker or increase capacity.':'Free capacity available.'}`}))).sort((a,b)=>b.score-a.score);
 return {assignments:[...assigned].map(([palId,slot])=>({palId,slotId:slot.id})),gaps,replacements,unsuitable:workers.filter(p=>!slots.some(s=>suitability(p,s.work)>=s.minimum)).map(p=>p.id),idle:workers.filter(p=>!assigned.has(p.id)).map(p=>p.id),shortage:gaps.length};
}
