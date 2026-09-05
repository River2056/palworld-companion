import { integer, type Catalog } from '../domain/catalog';
import { normalizeCatalog, resolveRecipe, type CatalogSnapshot, type RecipeSelection } from '../domain/catalog-snapshot';
import styles from './crafting.module.css';
/** catalog is only a compatibility seam for explicit fixture callers, never a global fallback. */
export function IngredientTree({catalog,snapshot,item,quantity,recipeId,recipeOverrides,onRecipeOverride}:{catalog?:Catalog;snapshot?:CatalogSnapshot;item:string;quantity:number;recipeId?:string;recipeOverrides?:RecipeSelection['recipeOverrides'];onRecipeOverride?:(item:string,recipe:string)=>void}) {
 const craft=snapshot?.craft??(catalog?normalizeCatalog(catalog):undefined);
 if(!craft)return <p>snapshot-missing: ingredient tree unavailable</p>;
 const name=(id:string)=>craft.items.find(r=>r.id===id)?.name??id;
 let nodes=0;
 function branch(id:string,units:number,path:string[]):React.ReactNode {
  if(path.includes(id))return <p>Cycle blocked: {name(id)}</p>;
  if(path.length>=40||++nodes>10000)return <p>Expansion depth/node limit reached: {name(id)}</p>;
  const result=resolveRecipe(craft!,id,{...(!path.length&&recipeId!==undefined?{recipeId}:{}),recipeOverrides});
  if(result.status==='unresolved')return <p>Unknown ingredient: {id} — {result.code}; no expansion available</p>;
  if(result.status==='raw')return <p>Raw material: {name(id)} × {units}</p>;
  const recipe=result.recipe;
  const alternatives=craft!.recipes.filter(r=>r.outputItemId===id);
  try {
   integer(units,1);const runs=integer(Math.ceil(units/recipe.output_count),1),output=integer(runs*recipe.output_count);
   const inputs=recipe.inputs.map(i=>({...i,total:integer(i.count*runs)}));
   return <details><summary>{name(id)}: {units} units · {runs} runs × {recipe.output_count} output = {output} units; {output-units} branch surplus</summary><p>Recipe {recipe.id} · {recipe.variant} · Stations: {recipe.stations.join(', ')} · <a href={recipe.source.revision_url??recipe.source.url}>Recipe source</a></p>{path.length>0&&alternatives.length>1&&onRecipeOverride&&<label>Recipe for {name(id)}<select aria-label={`Recipe for ${name(id)}`} value={recipe.id} onChange={e=>onRecipeOverride(id,e.target.value)}>{alternatives.map(r=><option key={r.id} value={r.id}>{r.variant??r.id} · yield {r.output_count}</option>)}</select></label>}<ul>{inputs.map(i=><li key={i.item}><p>{name(i.item)}: {i.count} per run; {i.count}/{recipe.output_count} per output unit; {i.total} for this branch</p>{branch(i.item,i.total,[...path,id])}</li>)}</ul></details>;
  }catch{return <p>Expansion blocked: unsafe quantity for {name(id)}</p>;}
 }
 return <details className={styles.tree}><summary>Recipe ingredient tree</summary><p>Recipe structure only, not a shopping total. Each branch rounds independently to whole runs, ignoring stock and cross-branch surplus reuse. Do not add parent and child quantities. Use the combined shopping list for allocated shortages.</p>{branch(item,quantity,[])}</details>;
}
