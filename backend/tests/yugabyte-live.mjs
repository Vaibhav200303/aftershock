// Explicit live verification in an isolated schema, never production game tables.
import '../src/config.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Pool} from 'pg';
import {WorldStore} from '../src/persistence/store.mjs';
assert.ok(process.env.YUGABYTE_DATABASE_URL,'Configure the ignored .env first');
const ssl={ca:await fs.readFile(process.env.YUGABYTE_CA_CERT,'utf8'),rejectUnauthorized:true};
const admin=new Pool({connectionString:process.env.YUGABYTE_DATABASE_URL,ssl,max:1,connectionTimeoutMillis:15000,statement_timeout:30000});
await admin.query('CREATE SCHEMA IF NOT EXISTS aftershock_verification');await admin.end();
const url=new URL(process.env.YUGABYTE_DATABASE_URL);url.searchParams.set('options','-c search_path=aftershock_verification');
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'aftershock-live-'));
let store=await new WorldStore({dir,url:url.href,ca:process.env.YUGABYTE_CA_CERT}).init();
assert.equal(store.health.storage,'yugabyte');
try{
 const id='live-checkpoint',snapshot={round:1,history:[{round:1,gdp:12}],agents:[{id:1}],bank:{debt:0}};
 await store.save('run',{id,islandId:'day',status:'running',snapshot,agentDetails:[{id:1,traits:{patience:.5}}]});await store.flushing;
 await store.save('run',{id,islandId:'day',status:'completed',snapshot:{...snapshot,round:2,history:[...snapshot.history,{round:2,gdp:14}]},agentDetails:[{id:1,traits:{patience:.5}}]});await store.flushing;
 await store.save('lesson',{id:'verified-observation',islandId:'day',status:'approved',runId:id,text:'Live persistence verification record.'});await store.flushing;
 const count=await store.pool.query('SELECT count(*) AS count FROM aftershock_rounds WHERE run_id=$1',[id]);assert.equal(Number(count.rows[0].count),2);assert.equal(store.pending.size,0);await store.close();
 const fresh=await fs.mkdtemp(path.join(os.tmpdir(),'aftershock-live-recovery-'));
 store=await new WorldStore({dir:fresh,url:url.href,ca:process.env.YUGABYTE_CA_CERT}).init();assert.equal(store.latest('day').snapshot.round,2);assert.equal(store.latest('night'),null);assert.equal(store.listLessons('day')[0].status,'approved');
 console.log('PASS live YugabyteDB: verified TLS, atomic upserts, round backfill, approved lessons, fresh-directory recovery and island isolation.');
}finally{await store.close();}
