import fs from 'node:fs/promises';
import path from 'node:path';
import {CFG,ROOT} from '../config.mjs';
import {WorldStore} from './store.mjs';
import {MekoMemory} from '../memory/meko.mjs';
import {Academy} from '../memory/academy.mjs';
export const ISLANDS=[
 {id:'day',name:'Sunhaven',theme:'day',description:'Sunlit farms and timber lanes',profile:{'TASKS.gather_food.yield':10,'TASKS.gather_wood.yield':12,'TASKS.smoke_fish.yield':2.5,'FIRE_WOOD':3}},
 {id:'night',name:'Moonharbor',theme:'night',description:'Moonlit terraces and lantern-lit workshops',profile:{'TASKS.gather_food.yield':7,'TASKS.gather_wood.yield':9,'TASKS.smoke_fish.yield':4,'FIRE_WOOD':5}},
];
export const SCENARIOS={free:{name:'Free play',limit:0,schedule:[]},cold:{name:'Cold snap experiment',limit:12,schedule:[{round:3,preset:'coldsnap'},{round:8,preset:'baseline'}]},blight:{name:'Blight experiment',limit:12,schedule:[{round:3,preset:'blight'},{round:8,preset:'baseline'}]}};
export const islandById=id=>ISLANDS.find(i=>i.id===id)||ISLANDS[0];
export const store=await new WorldStore({dir:process.env.AFTERSHOCK_DATA_DIR||path.join(ROOT,'runs','.archive'),url:process.env.YUGABYTE_DATABASE_URL,ca:process.env.YUGABYTE_CA_CERT}).init();
export const meko=new MekoMemory({key:process.env.MEKO_API_KEY,url:process.env.MEKO_MCP_URL,datapacks:{day:process.env.MEKO_DAY_DATAPACK_ID||process.env.MEKO_DATAPACK_ID,night:process.env.MEKO_NIGHT_DATAPACK_ID}});
if(meko.key)meko.connect().catch(()=>{});
export const academy=new Academy({store,meko});
export const startupConfig=structuredClone(CFG);

// Upgrade older saved runs without losing the village the player was already viewing.
if(!process.env.AFTERSHOCK_DATA_DIR){
 for(const dir of (await fs.readdir(path.join(ROOT,'runs'),{withFileTypes:true}).catch(()=>[])).filter(d=>d.isDirectory()&&!d.name.startsWith('.')).sort((a,b)=>a.name.localeCompare(b.name))){
  try{const base=path.join(ROOT,'runs',dir.name),f=JSON.parse(await fs.readFile(path.join(base,'final.json'),'utf8'));if(!f.snapshot?.agents)continue;const snap=f.snapshot,id=snap.runId||'legacy-'+dir.name;if(store.runs.has(id))continue;const meta=JSON.parse(await fs.readFile(path.join(base,'meta.json'),'utf8'));const events=(await fs.readFile(path.join(base,'events.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
  await store.save('run',{id,islandId:snap.islandId||'day',status:'completed',updatedAt:f.stoppedAt||snap.endedAt||meta.startedAt,seed:meta.config?.SEED,memoryEnabled:snap.memoryEnabled??false,scenario:snap.scenario||'free',imported:true,matchKey:'legacy-unmatched',conditions:[],snapshot:{...snap,runId:id,islandId:snap.islandId||'day'},agentDetails:snap.agents.map(a=>({id:a.id,name:a.name,traits:meta.agents?.find(x=>x.id===a.id)?.traits||{},decisions:events.filter(e=>e.type==='decision'&&e.agent===a.id).map(e=>({round:e.round,activity:e.activity,thought:e.thought,actions:e.actions||[],orders:e.orders||[]})),journal:[]}))},{preserveUpdatedAt:true});
  }catch{/* A missing/incomplete older final file is not a recoverable checkpoint. */}
 }
}
