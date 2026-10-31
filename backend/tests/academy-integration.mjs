import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://localhost:8811';
const initial=await (await fetch(base+'/state')).json();
assert.equal(initial.maxRounds,4,'Use an isolated stub server with MAX_ROUNDS=4');
assert.equal(initial.running,false,'Do not replace an active village');
async function req(p,body,island='day'){const r=await fetch(base+p,{headers:{'X-Island-Id':island,'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});const s=await r.json();assert.ok(r.ok,JSON.stringify(s));return s;}
async function done(island='day'){for(let i=0;i<240;i++){const s=await req('/state',null,island);if(s.completed)return s;await new Promise(r=>setTimeout(r,250));}throw Error('timeout');}
await req('/start',{provider:'stub',agents:3,scenario:'cold',memoryEnabled:false,seed:555});
const first=await done();assert.equal(first.agents.length,3);assert.equal(first.memoryEnabled,false);
let learning=await req('/learning');assert.ok(learning.lessons.length,'Measured lesson missing');const lesson=learning.lessons.find(l=>l.runId===first.runId&&l.status==='pending');assert.ok(lesson);
await req('/learning/review',{id:lesson.id,action:'approve'});learning=await req('/learning');assert.equal(learning.lessons.find(l=>l.id===lesson.id).status,'approved');
await req('/start',{provider:'stub',agents:3,scenario:'cold',memoryEnabled:true,seed:555});const second=await done();assert.ok(second.agents.some(a=>a.memoryEvidence?.items?.length),'Approved evidence missing from agent context');assert.notEqual(second.agents[0].memoryEvidence.mode,'disabled');
const night=await req('/state',null,'night');assert.equal(night.islandId,'night');assert.equal(night.running,false);assert.equal((await req('/learning',null,'night')).lessons.length,0);
console.log('PASS measured disaster proposal, approval, memory-off/on recall, final agent evidence and island isolation');
