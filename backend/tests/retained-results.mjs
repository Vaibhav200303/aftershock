import assert from 'node:assert/strict';
// Run against an isolated stub server with MAX_ROUNDS=2 (never the live village).
const base=process.env.TEST_BASE_URL||'http://localhost:8811';
const initial=await (await fetch(base+'/state')).json();
assert.equal(initial.maxRounds,2,'This test requires an isolated server with MAX_ROUNDS=2');
assert.equal(initial.running,false,'Do not replace an active village');
const get=async p=>(await fetch(base+p)).json();
const post=async(p,body={})=>{const r=await fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const s=await r.json();assert.ok(r.ok,JSON.stringify(s));return s;};
const until=async fn=>{for(let i=0;i<160;i++){const s=await get('/state');if(fn(s))return s;await new Promise(r=>setTimeout(r,250));}throw Error('State wait timed out');};
await post('/start',{provider:'stub',agents:3});
const final=await until(s=>s.completed);
assert.equal(final.running,false);assert.equal(final.endReason,'limit');assert.equal(final.agents.length,3);assert.ok(final.history.length>=2);
const log=await get('/agent?id='+final.agents[0].id);assert.ok(log.decisions.length);assert.ok(log.traits);
await new Promise(r=>setTimeout(r,1000));const same=await get('/state');assert.equal(same.seconds,final.seconds);assert.equal(same.round,final.round);assert.equal(same.llm.calls,final.llm.calls);
console.log('PASS automatic completion retains snapshot, history, agents, traits and logs; elapsed time remains frozen');
await post('/start',{provider:'stub',agents:2});await post('/pause');await until(s=>s.paused);await post('/resume');await post('/stop');const stopped=await get('/state');assert.equal(stopped.completed,true);assert.equal(stopped.endReason,'stopped');assert.equal(stopped.agents.length,2);console.log('PASS fresh run replaces results; Pause/Resume and manual Stop retain the new village');
