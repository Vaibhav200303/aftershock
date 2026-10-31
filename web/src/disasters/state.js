// Effects describe actual dial values, never a separately selected visual preset.
export const DISASTERS = [
  {id:'famine',label:'Bad fishing season',key:'CATCH',target:.35,note:'Fishing catches are reduced.'},
  {id:'blight',label:'Blight',key:'SPOIL.0',target:.4,note:'Unprotected food spoils faster.'},
  {id:'coldsnap',label:'Cold snap',key:'FIRE_WOOD',target:9,note:'Fires consume more wood.'},
  {id:'forestfire',label:'Forest fire',key:'TASKS.gather_wood.yield',target:4,note:'Wood gathering yields are reduced.'},
  {id:'hurricane',label:'Hurricane',keys:[['SPOIL.4',.03],['SPOIL.2',.08]],note:'Houses and nets face increased losses.'},
  {id:'crunch',label:'Credit crunch',key:'BANK.CREDIT',target:false,note:'New lending is closed; existing debts remain.'},
];
const clamp=x=>Math.min(1,Math.max(0,x));
export function deriveDisasters(snapshot){
 const values=new Map((snapshot?.tunables||[]).map(t=>[t.key,t]));
 const severity=(key,target)=>{const t=values.get(key);if(!t)return 0;if(target===false)return t.value===false&&t.dflt!==false?1:0;
 if(!Number.isFinite(t.value)||!Number.isFinite(t.dflt)||target===t.dflt)return 0;
 return clamp((t.value-t.dflt)/(target-t.dflt));};
 return Object.fromEntries(DISASTERS.map(d=>[d.id,d.keys?Math.max(...d.keys.map(([k,t])=>severity(k,t))):severity(d.key,d.target)]));
}
let current=deriveDisasters(null),timer=null,inFlight=false;
const subscribers=new Set();
export function acceptDisasters(snapshot){if(!Array.isArray(snapshot?.tunables))return;current=deriveDisasters(snapshot);for(const fn of subscribers)fn(current);}
async function refresh(){if(inFlight||document.hidden)return;inFlight=true;try{const res=await fetch('/tunables');if(res.ok)acceptDisasters(await res.json());}catch{/* Keep the last known weather on a connection loss. */}finally{inFlight=false;}}
export function subscribeDisasters(fn){subscribers.add(fn);fn(current);if(!timer){refresh();timer=setInterval(refresh,2500);}return()=>{subscribers.delete(fn);if(!subscribers.size){clearInterval(timer);timer=null;}};}
