// Explicit live read/write check. Writes clearly labeled verification facts, not game lessons.
import '../src/config.mjs';
import assert from 'node:assert/strict';
import {MekoMemory} from '../src/memory/meko.mjs';
const m=new MekoMemory({key:process.env.MEKO_API_KEY,datapacks:{day:process.env.MEKO_DAY_DATAPACK_ID,night:process.env.MEKO_NIGHT_DATAPACK_ID}});
try{
 for(const islandId of ['day','night']){
  const lesson={id:'integration-check-v1',islandId,runId:'connection-verification',startRound:0,endRound:0,text:`Integration verification only: ${islandId==='day'?'Sunhaven is the day island':'Moonharbor is the night island'}. This is not an economic observation or a gameplay lesson.`};
  await m.publish(lesson);let result;
  for(let i=0;i<4;i++){result=await m.search(islandId,`aftershock:${islandId}:lesson:${lesson.id}`);if(JSON.stringify(result).includes(`aftershock:${islandId}:lesson:${lesson.id}`))break;await new Promise(r=>setTimeout(r,1500));}
  assert.ok(JSON.stringify(result).includes(`aftershock:${islandId}:lesson:${lesson.id}`),'Memory write was not verified');
 }
 const other=await m.search('night','aftershock:day:lesson:integration-check-v1');assert.ok(!JSON.stringify(other).includes('aftershock:day:lesson:integration-check-v1'));
 console.log('PASS live Meko: authenticated MCP, conversation IDs, memory publication/read-back and separate island datapacks.');
}finally{await m.close();}
