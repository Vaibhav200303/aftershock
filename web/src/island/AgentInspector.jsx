import React,{useState,useEffect,useRef} from 'react';
import {subscribe} from '../store.js';
import {bodyOf,moodOf} from './blob.js';
import {paintBlob} from './blob3d.js';
import './agent-inspector.css';
const jobColor={gather_food:'#1f9fb5',gather_wood:'#3f9450',craft_net:'#d98c2b',smoke_fish:'#d98c2b',build_house:'#cf6046',idle:'#8a8f98'};
const words=x=>String(x??'').replaceAll('_',' ');
const number=x=>Number.isFinite(x)?x.toLocaleString(undefined,{maximumFractionDigits:2}):'—';
export function AgentPortrait({agent}){
 const ref=useRef(null);
 useEffect(()=>{const cv=ref.current;if(!cv)return;const dpr=Math.min(devicePixelRatio||1,2);cv.width=120*dpr;cv.height=144*dpr;
 paintBlob(cv.getContext('2d'),{id:agent.id,mood:moodOf(agent),blink:false,color:jobColor[agent.activity]||'#8a8f98',w:120,h:144,dpr});},[agent.id,agent.activity,agent.hunger,agent.cold,agent.debt,agent.house]);
 return <canvas ref={ref} width="120" height="144" role="img" aria-label={`${bodyOf(agent.id).persona} dot portrait`}/>;
}
export default function AgentInspector(){
 const [snapshot,setSnapshot]=useState(null),[selected,setSelected]=useState(null),[open,setOpen]=useState(false),[detail,setDetail]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[retry,setRetry]=useState(0);
 const closeRef=useRef(null);
 useEffect(()=>subscribe(s=>setSnapshot(s)),[]);
 useEffect(()=>{const pick=e=>{setSelected(e.detail);setOpen(true);};window.addEventListener('moku:agent',pick);return()=>window.removeEventListener('moku:agent',pick);},[]);
 useEffect(()=>{if(!open)return;const previous=document.activeElement;closeRef.current?.focus();const key=e=>{if(e.key==='Escape'){e.stopPropagation();setOpen(false);}};window.addEventListener('keydown',key,true);return()=>{window.removeEventListener('keydown',key,true);if(previous?.isConnected)previous.focus?.();};},[open,selected]);
 const agent=snapshot?.agents?.find(a=>a.id===selected);
 useEffect(()=>{if(!open||selected==null||!agent){setDetail(null);return;}const controller=new AbortController();setError('');setLoading(true);
 fetch(`/agent?id=${encodeURIComponent(selected)}`,{signal:controller.signal}).then(async r=>{if(!r.ok)throw Error('Could not load this agent’s history.');return r.json();}).then(d=>setDetail(d)).catch(e=>{if(e.name!=='AbortError')setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
 return()=>controller.abort();},[selected,open,snapshot?.round,snapshot?.running,snapshot?.runId,retry,!!agent]);
 useEffect(()=>setDetail(null),[selected,snapshot?.runId]);
 const agents=snapshot?.agents||[],persona=agent?bodyOf(agent.id):null;
 const stats=(items)=><dl className="ai-stats">{items.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{number(value)}</dd></div>)}</dl>;
 return <><button className="ai-launch" onClick={()=>{setSelected(null);setOpen(true);}}>Agents <span>{agents.length}</span></button>
 {open&&<button className="ai-backdrop" tabIndex={-1} aria-label="Dismiss agent profile" onClick={()=>setOpen(false)}/>}
 {open&&<aside className="agent-inspector" role="dialog" aria-label={agent?`${agent.name} agent profile`:'Village agents'}>
 <header><div><h2>{agent?'Agent profile':'Village agents'}</h2><p>Meet the minds behind the village</p></div><button ref={closeRef} onClick={()=>setOpen(false)} aria-label="Close agent profile">×</button></header>
 <div className="ai-scroll">
 {selected!=null&&<button className="ai-back" onClick={()=>setSelected(null)}>All agents</button>}
 {selected==null?<><p>Select a villager here or click a dot on the island.</p><div className="ai-roster">{agents.map(a=><button key={a.id} onClick={()=>setSelected(a.id)}><i style={{background:bodyOf(a.id).color}}/><span><b>{a.name}</b><small>{bodyOf(a.id).persona} · {words(a.activity)}</small></span></button>)}</div>{!agents.length&&<p className="ai-note">No active villagers. Start a village to meet its agents.</p>}</>:!agent?<p role="status">This agent is no longer in the active village.</p>:<>
 <div className="ai-identity"><AgentPortrait agent={agent}/><div><h3>{agent.name}</h3><span className="ai-chip">{persona.persona} appearance</span><p>Agent #{agent.id} · {agent.model||'Scripted brain'}</p></div></div>
 <section><h3>Current activity</h3><p className="ai-activity"><i style={{background:jobColor[agent.activity]||'#8a8f98'}}/>{words(agent.activity)}</p><p className="ai-note">Appearance stays with this agent. The colored badge follows their job.</p></section>
 <section><h3>Wellbeing & needs</h3>{stats([['Wellbeing',agent.wellbeing],['Hunger',agent.hunger],['Cold',agent.cold],['Wealth',agent.wealth]])}</section>
 <section><h3>Personality</h3><p className="ai-note">Behavioral traits from this simulation.</p>{detail?.traits?Object.entries(detail.traits).map(([k,v])=><label className="ai-trait" key={k}><span>{words(k)}</span><meter min="0" max="1" value={v} aria-label={words(k)}/><b>{Math.round(v*100)}%</b></label>):<p>{loading?'Loading traits…':'Traits are unavailable.'}</p>}</section>
 <section><h3>Resources & finances</h3>{stats([['Coins',agent.cash],['Debt',agent.debt],['Due in rounds',agent.dueIn],['Food',agent.food],['Wood',agent.wood],['Nets',agent.nets],['Smoked fish',agent.smoked],['Houses',agent.houses],['Build progress',agent.building],['Build shifts',agent.buildShifts]])}</section>
 <section><h3>Skills</h3><dl className="ai-skills">{Object.entries(agent.skills||{}).map(([k,v])=><div key={k}><dt>{words(k)}</dt><dd>{number(v)}×</dd></div>)}</dl></section>
 <section><h3>Remembered experience</h3><p className="ai-note">{agent.memoryEvidence?.mode||'No recalled experience in this turn.'}</p>{agent.memoryEvidence?.items?.map(m=><div className="ai-memory-evidence" key={m.id}><p>{m.text}</p><small>Source run {m.runId} · rounds {m.startRound}–{m.endRound} · {m.role}</small></div>)}<p className="ai-note">These are the observations supplied before this turn, not proof that they caused the selected action.</p></section>
 <section><h3>Latest thought</h3><blockquote>{agent.thought||'No thought recorded yet.'}</blockquote></section>
 <section><h3>Open orders</h3>{agent.orders?.length?<ul>{agent.orders.map((o,i)=><li key={i}>{typeof o==='string'?o:JSON.stringify(o)}</li>)}</ul>:<p>No open orders.</p>}</section>
 {loading&&<p role="status">Updating history…</p>}{error&&<p role="alert">{error} <button onClick={()=>setRetry(x=>x+1)}>Retry</button></p>}
 <section><h3>Decision history</h3>{detail?.decisions?.length?<ol className="ai-history">{[...detail.decisions].reverse().map((d,i)=><li key={`${d.t}-${i}`}><b>Round {d.round??'—'} · {words(d.activity||d.outcome)}</b><p>{d.thought||d.reason||'No explanation recorded.'}</p>{d.actions?.length>0&&<details><summary>{d.actions.length} actions</summary><pre>{JSON.stringify(d.actions,null,2)}</pre></details>}</li>)}</ol>:<p>No decisions recorded yet.</p>}</section>
 <section><h3>Journal</h3>{detail?.journal?.length?<ol className="ai-history">{[...detail.journal].reverse().map((j,i)=><li key={i}>{j.line??JSON.stringify(j)}</li>)}</ol>:<p>No journal entries yet.</p>}</section>
 {agent.memory&&<section><h3>Memory</h3><pre>{typeof agent.memory==='string'?agent.memory:JSON.stringify(agent.memory,null,2)}</pre></section>}
 </>}
 </div></aside>}</>;
}
