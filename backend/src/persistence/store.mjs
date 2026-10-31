import fs from 'node:fs/promises';
import path from 'node:path';
import {Pool} from 'pg';

export const SCHEMA=`
CREATE TABLE IF NOT EXISTS aftershock_runs (
 id TEXT PRIMARY KEY, island_id TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
 status TEXT NOT NULL, round INTEGER NOT NULL, payload JSONB NOT NULL);
CREATE INDEX IF NOT EXISTS aftershock_runs_island ON aftershock_runs(island_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS aftershock_rounds (
 run_id TEXT NOT NULL REFERENCES aftershock_runs(id), round INTEGER NOT NULL,
 payload JSONB NOT NULL, PRIMARY KEY(run_id,round));
CREATE TABLE IF NOT EXISTS aftershock_lessons (
 id TEXT PRIMARY KEY, island_id TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
 status TEXT NOT NULL, payload JSONB NOT NULL);
CREATE INDEX IF NOT EXISTS aftershock_lessons_island ON aftershock_lessons(island_id,status);`;
const clone=x=>JSON.parse(JSON.stringify(x));
export class WorldStore {
 constructor({dir,url,ca}={}){this.dir=dir;this.url=url;this.ca=ca;this.runs=new Map();this.lessons=new Map();this.queue=Promise.resolve();this.pool=null;this.pending=new Map();this.health={storage:url?'connecting':'local',databaseConfigured:!!url,error:null};}
 async init(){await fs.mkdir(this.dir,{recursive:true,mode:0o700});for(const name of await fs.readdir(this.dir)){if(!/^(run|lesson)-[a-zA-Z0-9_-]+\.json$/.test(name))continue;try{const p=JSON.parse(await fs.readFile(path.join(this.dir,name),'utf8'));(name.startsWith('run-')?this.runs:this.lessons).set(p.id,p);this.pending.set(name,p);}catch{this.health.error='A local checkpoint could not be read.';}}
 if(this.url){try{this.pool=new Pool({connectionString:this.url,max:4,connectionTimeoutMillis:15000,statement_timeout:30000,...(this.ca?{ssl:{ca:await fs.readFile(this.ca,'utf8'),rejectUnauthorized:true}}:{})});this.pool.on('error',()=>{this.health.storage='degraded';this.health.error='Database connection lost; local checkpoints remain available.';});await this.pool.query(SCHEMA);this.schemaReady=true;
 for(const [table,map,prefix] of [['aftershock_runs',this.runs,'run'],['aftershock_lessons',this.lessons,'lesson']]){const {rows}=await this.pool.query(`SELECT payload FROM ${table}`);for(const {payload:p} of rows){if(!map.has(p.id)||map.get(p.id).updatedAt<p.updatedAt){map.set(p.id,p);this.pending.delete(`${prefix}-${p.id}.json`);await this.atomic(`${prefix}-${p.id}.json`,p);}}}
 await this.flush();this.health.storage='yugabyte';this.health.error=null;
 }catch{this.health.storage='degraded';this.health.error='YugabyteDB unavailable; saving locally until it reconnects.';}}
 if(this.pool){this.retryTimer=setInterval(()=>{if(this.pending.size)this.scheduleFlush();},15000);this.retryTimer.unref();}
 return this;}
 async atomic(name,data){const dest=path.join(this.dir,name),tmp=dest+'.tmp';await fs.writeFile(tmp,JSON.stringify(data),{mode:0o600});await fs.rename(tmp,dest);}
 async save(kind,data,{preserveUpdatedAt=false}={}){return this.serialize(async()=>{const p=clone({...data,updatedAt:preserveUpdatedAt&&data.updatedAt?data.updatedAt:new Date().toISOString()}),name=`${kind}-${p.id}.json`;await this.atomic(name,p);(kind==='run'?this.runs:this.lessons).set(p.id,p);this.pending.set(name,p);this.scheduleFlush();return clone(p);});}
 serialize(fn){const next=this.queue.then(fn);this.queue=next.catch(()=>{});return next;}
 scheduleFlush(){if(!this.pool||this.flushing||Date.now()<(this.retryAt||0))return;this.flushing=this.flush().catch(()=>{this.health.storage='degraded';this.health.error='Database unavailable; checkpoint saved locally.';this.retryAt=Date.now()+15000;}).finally(()=>{this.flushing=null;if(this.pending.size&&Date.now()>=(this.retryAt||0))this.scheduleFlush();});}
 async flush(){if(!this.schemaReady){await this.pool.query(SCHEMA);this.schemaReady=true;}for(const [name,p] of this.pending){const client=await this.pool.connect();try{await client.query('BEGIN');if(name.startsWith('run-')){await client.query(`INSERT INTO aftershock_runs VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET updated_at=EXCLUDED.updated_at,status=EXCLUDED.status,round=EXCLUDED.round,payload=EXCLUDED.payload WHERE aftershock_runs.updated_at<=EXCLUDED.updated_at`,[p.id,p.islandId,p.updatedAt,p.status,p.snapshot.round||0,p]);if(p.snapshot.round>0)await client.query(`INSERT INTO aftershock_rounds(run_id,round,payload) SELECT $1,(item->>'round')::INTEGER,item FROM jsonb_array_elements($2::jsonb) item ON CONFLICT(run_id,round) DO NOTHING`,[p.id,JSON.stringify(p.snapshot.history?.length?p.snapshot.history:[p.snapshot])]);}else await client.query(`INSERT INTO aftershock_lessons VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET updated_at=EXCLUDED.updated_at,status=EXCLUDED.status,payload=EXCLUDED.payload WHERE aftershock_lessons.updated_at<=EXCLUDED.updated_at`,[p.id,p.islandId,p.updatedAt,p.status,p]);await client.query('COMMIT');if(this.pending.get(name)===p)this.pending.delete(name);this.health.storage='yugabyte';this.health.error=null;}catch{await client.query('ROLLBACK').catch(()=>{});this.health.storage='degraded';this.health.error='Database write deferred; checkpoint is safe locally.';this.retryAt=Date.now()+15000;break;}finally{client.release();}}}
 listRuns(islandId){return [...this.runs.values()].filter(r=>!islandId||r.islandId===islandId).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(clone);}
 latest(islandId){return this.listRuns(islandId)[0]||null;}
 listLessons(islandId){return [...this.lessons.values()].filter(l=>l.islandId===islandId).map(clone);}
 async close(){clearInterval(this.retryTimer);await this.queue;await this.flushing;await this.pool?.end();}
}
