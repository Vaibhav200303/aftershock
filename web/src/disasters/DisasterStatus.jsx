import React,{useEffect,useState} from 'react';
import {DISASTERS,subscribeDisasters} from './state.js';
import './disasters.css';
export default function DisasterStatus(){
 const [state,setState]=useState({}),[recovering,setRecovering]=useState(false);
 useEffect(()=>{let wasActive=false,timeout;const off=subscribeDisasters(s=>{const active=Object.values(s).some(x=>x>.01);if(wasActive&&!active){setRecovering(true);clearTimeout(timeout);timeout=setTimeout(()=>setRecovering(false),4000);}if(active)setRecovering(false);wasActive=active;setState(s);});return()=>{off();clearTimeout(timeout);};},[]);
 const active=DISASTERS.filter(d=>state[d.id]>.01);
 if(!active.length&&!recovering)return null;
 return <div className="disaster-status" role="status" aria-live="polite"><strong>{active.length?'Village conditions':'Conditions easing'}</strong>{active.map(d=><div key={d.id}><b>{d.label}</b><span>{d.note}</span></div>)}{!active.length&&<span>The island is returning to its usual conditions.</span>}</div>;
}
