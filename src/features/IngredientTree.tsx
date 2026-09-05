import { integer, type Catalog } from '../domain/catalog';
import styles from './crafting.module.css';

export function IngredientTree({catalog,item,quantity}:{catalog:Catalog;item:string;quantity:number}) {
 const name=(id:string)=>[...catalog.recipes,...catalog.leaf_materials].find(r=>r.id===id)?.name??id;
 function branch(id:string,units:number,path:string[]):React.ReactNode {
  if(path.includes(id)) return <p>Cycle blocked: {name(id)}</p>;
  if(path.length>=40) return <p>Expansion depth limit reached: {name(id)}</p>;
  const recipe=catalog.recipes.find(r=>r.id===id);
  if(!recipe) return <p>{catalog.leaf_materials.some(r=>r.id===id)?`Raw material: ${name(id)} × ${units}`:`Unknown ingredient: ${id} — no expansion available`}</p>;
  try {
   integer(units,1);integer(recipe.output_count,1);
   const runs=integer(Math.ceil(units/recipe.output_count),1);const output=integer(runs*recipe.output_count);
   const inputs=recipe.inputs.map(i=>({...i,total:integer(integer(i.count,1)*runs)}));
   return <details><summary>{name(id)}: {units} units · {runs} runs × {recipe.output_count} output = {output} units; {output-units} branch surplus</summary><ul>{inputs.map(i=><li key={i.item}><p>{name(i.item)}: {i.count} per run; {i.count}/{recipe.output_count} per output unit; {i.total} for this branch</p>{branch(i.item,i.total,[...path,id])}</li>)}</ul></details>;
  } catch {return <p>Expansion blocked: unsafe quantity for {name(id)}</p>;}
 }
 return <details className={styles.tree}><summary>Recipe ingredient tree</summary><p>Recipe structure only, not a shopping total. Each branch rounds independently to whole runs, ignoring stock and cross-branch surplus reuse. Do not add parent and child quantities. Use the combined shopping list for allocated shortages.</p>{branch(item,quantity,[])}</details>;
}
