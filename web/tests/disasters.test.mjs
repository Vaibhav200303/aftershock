import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {deriveDisasters,DISASTERS,acceptDisasters} from '../src/disasters/state.js';
import {createDisasterEffects} from '../src/disasters/effects.js';
const defaults={'CATCH':1,'SPOIL.0':.1,'FIRE_WOOD':3,'TASKS.gather_wood.yield':12,'SPOIL.4':0,'SPOIL.2':0,'BANK.CREDIT':true};
const snapshot=changes=>({tunables:Object.entries(defaults).map(([key,dflt])=>({key,dflt,value:changes[key]??dflt}))});
test('baseline, every preset, partial severity, combined shocks and recovery',()=>{
 assert.ok(Object.values(deriveDisasters(snapshot({}))).every(x=>x===0));
 for(const d of DISASTERS){const changes=Object.fromEntries(d.keys||[[d.key,d.target]]);assert.equal(deriveDisasters(snapshot(changes))[d.id],1);}
 assert.ok(Math.abs(deriveDisasters(snapshot({CATCH:.675})).famine-.5)<1e-12);
 const combined=deriveDisasters(snapshot({'SPOIL.0':.4,'FIRE_WOOD':9,'BANK.CREDIT':false}));
 assert.equal(combined.blight,1);assert.equal(combined.coldsnap,1);assert.equal(combined.crunch,1);
 assert.equal(deriveDisasters(snapshot({'SPOIL.2':.08})).hurricane,1);
 assert.equal(deriveDisasters(snapshot({CATCH:1.5})).famine,0);
 assert.ok(Object.values(deriveDisasters(null)).every(x=>x===0));
});
test('effect pools animate without NaNs, recover, and dispose; reduced motion suppresses rain',()=>{
 globalThis.document={hidden:true};const motion={matches:false};globalThis.matchMedia=()=>motion;
 const scene=new THREE.Scene(),sun=new THREE.DirectionalLight(),hemi=new THREE.HemisphereLight();
 const water=Object.fromEntries(['uDeep','uMid','uShallow'].map(k=>[k,{value:new THREE.Color('#248899')}]));water.uStorm={value:0};
 const land=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshStandardMaterial());
 const fx=createDisasterEffects({scene,height:()=>2,areas:['forest','market','docks'].map((id,i)=>({id,x:i*20,z:i*10})),sun,hemi,water,land});
 try{
 acceptDisasters(snapshot(Object.fromEntries(DISASTERS.flatMap(d=>d.keys||[[d.key,d.target]]))));
 for(let i=0;i<50;i++)fx.update(i/10,false);
 assert.ok(water.uStorm.value>.99);
 scene.traverse(o=>{if(o.geometry?.attributes.position)assert.ok(o.geometry.attributes.position.array.every(Number.isFinite));});
 acceptDisasters(snapshot({}));for(let i=50;i<160;i++)fx.update(i/10,true);assert.ok(water.uStorm.value<.001);
 motion.matches=true;acceptDisasters(snapshot({'SPOIL.4':.03}));fx.update(17,false);assert.equal(scene.children[0].children.find(o=>o.isLineSegments).visible,false);
 }finally{fx.dispose();assert.equal(scene.children.length,0);land.geometry.dispose();land.material.dispose();}
});
