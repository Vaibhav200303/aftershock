import {NIGHT} from '../world/theme.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const C = { stone:0xb6ae97, light:0xe2d1ac, wood:0x68432c, oak:0xad773d, plaster:0xf1dbb0,
  roof:0xcd5b2e, tile:0xd56a34, blue:0x247da9, gold:0xe7b84a, glass:0x648f92, leaf:0x508638 };
const seeded = (a,b=0) => { const v=Math.sin(a*127.1+b*311.7)*43758.5453;return v-Math.floor(v); };

// A common material language for every building, including the five live work locations.
// The temporary scene is baked by material: architectural detail costs triangles, not draws.
export function addStrategyVillage(scene, height, areas) {
  const root=new THREE.Group(), materials=new Map(), smokeOrigins=[], flags=[], residents=[], landmarks={};
  let buildingCount=0;
  const texture = kind => {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,128,128);
    for(let i=0;i<950;i++) {
      ctx.fillStyle=`rgba(80,55,30,${0.02+seeded(i,3)*0.07})`;
      ctx.fillRect(seeded(i,1)*128,seeded(i,2)*128,1+seeded(i,4)*3,1);
    }
    if(kind==='stone') {
      ctx.strokeStyle='#a59e90';ctx.lineWidth=2;
      for(let y=0;y<=128;y+=32) {
        ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(128,y);ctx.stroke();
        for(let x=(y%64?0:32);x<128;x+=64) {ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+32);ctx.stroke();}
      }
    } else if(kind==='wood') {
      ctx.strokeStyle='#ab9980';ctx.lineWidth=2;
      for(let x=0;x<=128;x+=25) {ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+2,128);ctx.stroke();}
    }
    const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
  };
  const textures={stone:texture('stone'),wood:texture('wood'),plaster:texture('plaster'),clay:texture('plaster')};
  const relief=Object.fromEntries(Object.entries(textures).map(([kind,t])=>{
    const bump=t.clone();bump.colorSpace=THREE.NoColorSpace;bump.needsUpdate=true;return [kind,bump];
  }));
  const mat=(color,kind='plain') => {
    if(kind==='plain'&&[C.roof,C.tile,0xd06a35,C.blue,0x638c83].includes(color)) kind='clay';
    const key=`${color}:${kind}`;
    if(!materials.has(key)) materials.set(key,new THREE.MeshStandardMaterial({color:NIGHT&&kind==='clay'?(color===C.blue?0x36507c:0x667080):color,emissive:NIGHT&&color===C.glass?0xffbe66:0x000000,emissiveIntensity:NIGHT&&color===C.glass?.65:0,
      roughness:kind==='wood'?0.76:kind==='stone'?0.92:kind==='clay'?0.64:0.85,
      map:textures[kind]||null,bumpMap:relief[kind]||null,
      bumpScale:kind==='stone'?0.09:kind==='wood'?0.055:0.025,
      roughnessMap:relief[kind]||null}));
    return materials.get(key);
  };
  const mesh=(g,geo,color,kind='plain') => {const m=new THREE.Mesh(geo,mat(color,kind));g.add(m);return m;};
  const box=(g,w,h,d,x,y,z,color,kind='plain') => {const m=mesh(g,new THREE.BoxGeometry(w,h,d),color,kind);m.position.set(x,y,z);return m;};
  const cyl=(g,r,h,x,y,z,color,top=r) => {const m=mesh(g,new THREE.CylinderGeometry(top,r,h,10),color);m.position.set(x,y,z);return m;};
  const ball=(g,r,x,y,z,color) => {const m=mesh(g,new THREE.IcosahedronGeometry(r,1),color);m.position.set(x,y,z);return m;};
  const group=(x,z,y=height(x,z)) => {const g=new THREE.Group();g.position.set(x,y,z);root.add(g);return g;};
  const beam=(g,a,b,r,color=C.wood) => {
    const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),v=bv.clone().sub(av);
    const m=box(g,r,v.length(),r,...av.add(bv).multiplyScalar(0.5).toArray(),color,'wood');
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return m;
  };
  function barrel(g,x,z,y=0) {
    cyl(g,0.65,1.55,x,y+0.78,z,C.oak,0.56);
    for(const h of [0.3,1.2]) cyl(g,0.68,0.12,x,y+h,z,0x5e655e);
    cyl(g,0.51,0.08,x,y+1.59,z,0xc09155);
  }
  function crate(g,x,z,y=0) {
    box(g,1.5,1.4,1.5,x,y+0.7,z,C.oak,'wood');
    for(const a of [-0.58,0.58]) box(g,0.15,1.5,1.6,x+a,y+0.7,z,C.wood);
    beam(g,[x-0.6,y+0.1,z+0.78],[x+0.6,y+1.3,z+0.78],0.15);
  }
  function lamp(g,x,z,y=0) {
    box(g,0.2,3.3,0.2,x,y+1.65,z,C.wood);
    box(g,0.6,0.9,0.6,x,y+3,z,0xffd379);box(g,0.85,0.18,0.85,x,y+3.5,z,C.wood);
  }
  function flowers(g,x,y,z,w=2.1) {
    box(g,w,0.45,0.7,x,y,z,C.oak,'wood');
    for(let i=0;i<5;i++) {
      const px=x-w/2+0.25+i*w/5;
      ball(g,0.32,px,y+0.35,z,C.leaf);ball(g,0.18,px,y+0.6,z,[0xeac74c,0xdb686b,0xd4adcf][i%3]);
    }
  }
  function roof(g,w,d,y,color=C.roof) {
    const half=w/2+0.7,rise=w*0.42,angle=Math.atan2(rise,half),slope=Math.hypot(half,rise);
    const shape=new THREE.Shape();shape.moveTo(-w/2,0);shape.lineTo(w/2,0);shape.lineTo(0,rise);shape.closePath();
    const gable=mesh(g,new THREE.ExtrudeGeometry(shape,{depth:d,bevelEnabled:false}),C.plaster,'plaster');gable.position.set(0,y,-d/2);
    for(const side of [-1,1]) {
      const slab=box(g,slope,0.32,d+1.5,side*half/2,y+rise/2,0,C.wood);slab.rotation.z=-side*angle;
      // Individual overlapping tiles with subtly varied clay colors.
      const rows=6,cols=Math.ceil(d/1.35);
      for(let row=0;row<rows;row++) for(let col=0;col<cols;col++) {
        const t=(row+0.5)/rows,z=(col+0.5)/cols*(d+1.4)-(d+1.4)/2;
        const tile=box(g,slope/rows+0.14,0.22,(d+1.4)/cols-0.035,side*half*t,y+rise*(1-t)+0.25,z,
          color===C.roof ? [C.roof,C.tile,0xd06a35][Math.floor(seeded(row*17+col,w)*3)] : color);
        tile.rotation.z=-side*angle;
      }
      for(const z of [-(d/2+0.8),d/2+0.8]) beam(g,[0,y+rise+0.25,z],[side*half,y,z],0.32,C.oak);
    }
    for(let z=-d/2-0.5;z<d/2+0.7;z+=1) {
      const ridge=cyl(g,0.33,1.08,0,y+rise+0.37,z,color===C.blue?C.gold:C.tile);ridge.rotation.x=Math.PI/2;
    }
  }
  function addWindow(g,x,y,z,side=1) {
    box(g,1.65,1.95,0.2,x,y,z,C.wood);
    box(g,1.25,1.52,0.23,x,y,z+side*0.13,C.glass);
    box(g,0.12,1.6,0.24,x,y,z+side*0.26,C.light);
    box(g,1.35,0.12,0.24,x,y,z+side*0.26,C.light);
    for(const s of [-1,1]) box(g,0.55,1.9,0.2,x+s*1.12,y,z+side*0.14,0x497d76,'wood');
  }
  function building(x,z,{w=10,d=9,h=6,color=C.roof,rot=0,variant=0}={}) {
    // Sample all corners so a plinth meets the landscape even on the harbor terraces.
    const cs=Math.cos(rot),sn=Math.sin(rot);let low=Infinity,high=-Infinity;
    for(const a of [-1,1]) for(const b of [-1,1]) {
      const gy=height(x+a*w/2*cs+b*d/2*sn,z-a*w/2*sn+b*d/2*cs);low=Math.min(low,gy);high=Math.max(high,gy);
    }
    const g=group(x,z,high+0.1);g.rotation.y=rot;buildingCount++;
    box(g,w+0.9,high-low+1.1,d+0.9,0,-(high-low)/2+0.35,0,C.stone,'stone');
    box(g,w+2,0.15,d+3,0,0.18,0,C.light,'stone');
    box(g,w,h,d,0,h/2+0.8,0,[C.plaster,0xe2c399,0xf3ddb8,0xdbceaa][variant%4],'plaster');
    // Timber frame on all four elevations; no unmodeled blank rear walls.
    for(const s of [-1,1]) {
      for(const px of [-w/2+0.2,0,w/2-0.2]) box(g,0.35,h+0.25,0.35,px,h/2+0.8,s*(d/2+0.1),C.wood,'wood');
      for(const y of [1.1,h>7?4.8:h*0.6,h+0.7]) box(g,w+0.4,0.3,0.3,0,y,s*(d/2+0.16),C.wood,'wood');
      for(const px of [-w*0.28,w*0.28]) {
        addWindow(g,px,h>7?6.5:3.3,s*(d/2+0.18),s);
        if(s===1) flowers(g,px,h>7?5.25:2.05,d/2+0.6);
      }
      for(const pz of [-d*0.3,d*0.3]) {
        box(g,0.25,1.8,1.55,s*(w/2+0.15),3,pz,C.wood);
        box(g,0.28,1.4,1.15,s*(w/2+0.3),3,pz,C.glass);
      }
      for(const y of [1.2,h>7?4.8:h*0.6,h+0.7]) box(g,0.3,0.28,d+0.4,s*(w/2+0.1),y,0,C.wood,'wood');
      if(h>7) for(const pz of [-d*0.28,d*0.28]) {
        box(g,0.3,1.7,1.5,s*(w/2+0.15),6.5,pz,C.wood);
        box(g,0.32,1.3,1.1,s*(w/2+0.32),6.5,pz,C.glass);
      }
      beam(g,[s*(w/2+0.18),h*0.62,-d/2+0.3],[s*(w/2+0.18),h+0.6,0],0.2);
      box(g,0.35,h+0.2,d+0.4,s*(w/2-0.1),h/2+0.8,0,C.wood,'wood');
    }
    beam(g,[-w/2+0.4,h*0.62,d/2+0.2],[-1,h+0.5,d/2+0.2],0.22);
    beam(g,[w/2-0.4,h*0.62,-d/2-0.2],[1,h+0.5,-d/2-0.2],0.22);
    box(g,2.1,3.1,0.3,0,2.35,d/2+0.3,C.wood,'wood');
    box(g,2.6,0.35,0.5,0,4,d/2+0.35,C.oak);ball(g,0.13,0.63,2.4,d/2+0.51,C.gold);
    for(let i=0;i<3;i++) box(g,3+i*0.4,0.25,0.65,0,0.65-i*0.22,d/2+0.7+i*0.62,C.light,'stone');
    roof(g,w,d,h+0.8,color);
    // Dormers, porch canopies, brick chimneys, handrails and trade signs vary by lot.
    if(variant%2===0) {
      const dormer=new THREE.Group();dormer.position.set(w*0.28,h+1.8,0);dormer.rotation.y=Math.PI/2;g.add(dormer);
      box(dormer,2.8,2.4,2.7,0,1.2,0,C.plaster,'plaster');
      addWindow(dormer,0,1.3,1.4);roof(dormer,3.2,3,2.4,color);
    }
    if(variant%3!==1) {
      box(g,3.6,0.3,2.7,0,4.35,d/2+1.5,color);
      for(const px of [-1.65,1.65]) box(g,0.23,4.1,0.23,px,2.25,d/2+2.6,C.wood);
    }
    const chimneyX=-w*0.29,chimneyZ=-d*0.23,chimneyY=h+w*0.34+1.8;
    box(g,1.45,4,1.5,chimneyX,chimneyY-1.3,chimneyZ,C.stone,'stone');
    box(g,1.85,0.4,1.9,chimneyX,chimneyY+0.8,chimneyZ,C.light,'stone');
    box(g,1.1,0.08,1.12,chimneyX,chimneyY+1.03,chimneyZ,0x4e4840);
    if(variant%3===0) {g.updateMatrixWorld(true);smokeOrigins.push(g.localToWorld(new THREE.Vector3(chimneyX,chimneyY+1.2,chimneyZ)));}
    barrel(g,w/2+1,d/2-0.7);crate(g,-w/2-0.7,-d/2+0.8);lamp(g,-w/2+0.4,d/2+0.8);
    if(variant%3===1) { // Hanging shop sign.
      beam(g,[w/2-1,4.6,d/2],[w/2-1,4.6,d/2+2.1],0.18);
      box(g,1.4,0.9,0.18,w/2-1,3.9,d/2+1.8,0x427b85);ball(g,0.28,w/2-1,3.9,d/2+1.95,C.gold);
    }
    return g;
  }
  function garden(x,z,id) {
    const g=group(x,z);box(g,5.6,0.25,3.3,0,0.16,0,0x6b5336);
    for(let r=0;r<3;r++) for(let c=0;c<6;c++) ball(g,0.33,-2.2+c*0.85,0.45,-1+r, id%2?0x8fa646:0x609346);
    for(const side of [-1,1]) box(g,5.9,0.25,0.25,0,0.35,side*1.7,C.oak);
    barrel(g,3.5,0);
  }
  function yard(x,z,id) {
    const g=group(x,z);
    for(let i=0;i<3;i++) crate(g,-2+i*1.7,-1,i===2?0.2:0);
    barrel(g,1,1.3);barrel(g,2.3,1.5);
    box(g,3.2,0.18,0.9,-1,1,2.5,C.oak);
    for(const px of [-2.2,0.2]) box(g,0.22,1,0.55,px,0.5,2.5,C.wood);
    if(id%2===0) {
      for(const px of [-3,3]) box(g,0.16,4.2,0.16,px,2.1,0,C.wood);
      beam(g,[-3,4,0],[3,4,0],0.055,C.light);
      for(let i=0;i<3;i++) box(g,1.15,1.5,0.06,-1.8+i*1.65,3.1,0,[0xf3e7cc,0x5c91a5,0xd59471][i]);
    }
  }
  // Stable variation gives the village a grown-over-time layout on every reload.
  const warp = (x,z) => NIGHT ? [x*.91+Math.sin(z*.07)*8,z*.78+(x>0?9:-5)] : [x + Math.sin(z*0.075)*3.8 + Math.sin(x*0.11)*1.8,
    z + Math.sin(x*0.08)*3.2 + Math.cos(z*0.09)*1.6];
  const lane = new THREE.CatmullRomCurve3([
    [-31,-29],[-3,-28],[29,-30],[32,-2],[30,29],[2,33],[-29,28],[-33,1]
  ].map(([x,z]) => {const [px,pz]=warp(x,z);return new THREE.Vector3(px,0,pz);}), true, 'centripetal');
  const lanePoints = lane.getPoints(180);
  const closestLane = (x,z) => lanePoints.reduce((best,p) => Math.hypot(p.x-x,p.z-z)<Math.hypot(best.x-x,best.z-z)?p:best,lanePoints[0]);
  const frontages=[];
  // Generous plots give each roofline a clear silhouette and room for a private yard.
  const lots=[-43,-17,17,43];let id=0;
  for(const z of lots) for(const x of lots) {
    if(Math.hypot(x,z)>64 || (Math.abs(x)===17&&Math.abs(z)===17)) continue;
    const v=id++,w=10.3+seeded(v,1)*2,d=8.2+seeded(v,2)*0.6;
    const [wx,wz]=warp(x,z);
    const bx=wx+(seeded(v,3)-0.5)*2,bz=wz+(seeded(v,4)-0.5)*2;
    const near=closestLane(bx,bz), rot=Math.atan2(near.x-bx,near.z-bz)+(seeded(v,9)-0.5)*0.35;
    frontages.push([bx+Math.sin(rot)*(d/2+3.6),bz+Math.cos(rot)*(d/2+3.6)]);
    building(bx,bz,{w,d,h:v%4===0?9:5.5+seeded(v,7)*1.5,rot,variant:v,color:v%7===0?0x638c83:C.roof});
    if(v%5>1) { const gx=bx-Math.sin(rot)*8,gz=bz-Math.cos(rot)*8; if(v%2) garden(gx,gz,v);else yard(gx,gz,v); }
  }
  // A spacious civic center connects the hall, well court and surrounding neighborhoods.
  const hall=building(-5,-3,{w:15,d:12,h:9,color:C.blue,variant:90});
  for(const side of [-1,1]) {
    const wing=new THREE.Group();wing.position.set(side*8.5,0,0);hall.add(wing);
    box(wing,4.5,5.2,9,0,3.1,0,C.light,'stone');roof(wing,5,9,5.7,C.blue);
    addWindow(wing,0,3.2,4.65);
  }
  box(hall,6,6,6,0,15.6,-1.8,C.light,'stone');
  const tower=new THREE.Group();tower.position.z=-1.8;hall.add(tower);roof(tower,6.4,6.4,18.6,C.blue);
  for(const s of [-1,1]) {box(hall,0.25,5,0.25,s*5,12.5,6.5,C.gold);box(hall,1.8,3.2,0.15,s*5+0.7,13,6.5,C.blue);}
  building(17,-15,{w:8,d:9,h:6,variant:8,color:0x638c83});
  const court=group(17,17);box(court,12,0.25,12,0,0.1,0,C.light,'stone');
  cyl(court,2,1.2,0,0.8,0,C.stone);cyl(court,1.5,0.07,0,1.45,0,0x3b8999);
  for(const x of [-2.2,2.2]) box(court,0.25,4,0.25,x,2.1,0,C.wood);
  roof(court,5,3.8,4,C.blue);barrel(court,4,3);flowers(court,-4,0.3,3,2.7);

  // The existing destinations now use the same architecture and furnished working yards.
  for(const a of areas) {
    const x=a.x,z=a.z;
    if(a.id==='docks') continue;
    const b=building(x,z,{w:a.id==='workshop'?10:8.5,d:7,h:a.id==='site'?5:6,variant:10+buildingCount,color:a.id==='forest'?0x638c83:C.roof});
    landmarks[a.id]={x,z,y:b.position.y+11};
    if(a.id==='forest') {
      for(let row=0;row<3;row++) for(let i=0;i<4-row;i++) {
        const m=cyl(b,0.44,4.5,6+i*0.85+row*0.4,0.5+row*0.8,-1,C.oak);m.rotation.z=Math.PI/2;
      }
      yard(x-7,z-4,3);
    } else if(a.id==='workshop') {
      box(b,3.1,3.6,2.8,6,1.8,-1,C.stone,'stone');box(b,1.8,1.8,0.15,6,1.3,0.45,0x573f2a);
      box(b,1.3,0.8,0.2,6,1,0.6,0xf5a647);yard(x-7,z,4);
    } else if(a.id==='site') {
      // Scaffolded builder's lodge with braced timbers, crane and supply boards.
      for(const sx of [-5.4,5.4]) for(const sz of [-4.4,4.4]) box(b,0.25,9,0.25,sx,4.5,sz,C.oak);
      for(const y of [3,6]) {box(b,11.5,0.2,1.3,0,y,4.5,C.oak,'wood');beam(b,[-5.4,y,4.6],[5.4,y+3,4.6],0.18);}
      beam(b,[7,0,-3],[7,11,-3],0.7);beam(b,[7,10.5,-3],[0,10.5,-3],0.6);beam(b,[7,5,-3],[1,10.5,-3],0.3);
      beam(b,[0,10.5,-3],[0,7.5,-3],0.07);crate(b,0,-3,6.3);
    }
  }
  function stall(x,z,color,rot=0) {
    const g=group(x,z);g.rotation.y=rot;
    for(const sx of [-2.2,2.2]) for(const sz of [-1.5,1.5]) box(g,0.18,3.3,0.18,sx,1.65,sz,C.wood);
    for(let i=0;i<8;i++) {
      const awning=box(g,0.6,0.16,4.2,-2.1+i*0.6,3.5,0.3,i%2?0xf3e4c3:color);awning.rotation.x=0.12;
      box(g,0.6,0.45,0.12,-2.1+i*0.6,3.02,2.38,i%2?0xf3e4c3:color);
    }
    box(g,4.6,1.25,1.5,0,0.7,1,C.oak,'wood');
    for(let i=0;i<3;i++) {box(g,1.25,0.25,1.1,-1.5+i*1.5,1.45,1,C.wood);for(let j=0;j<4;j++) ball(g,0.23,-1.8+i*1.5+j*0.22,1.75,1,[0xc37038,0x98ae4a,0xe1bb53][i]);}
    barrel(g,-3,0);crate(g,3,-1);
  }
  // Market arcade near the waterfront, plus small shops on the civic square.
  const market=areas.find(a=>a.id==='market');
  if(market) for(const off of [-10,-3,4,11]) stall(market.x+off,market.z+9,off%2?0xa85043:0x4b96aa,Math.PI);
  stall(22,6,0xb85c46,Math.PI/2);stall(6,24,0xd8ac54);

  // Harbor replaces the old single plank and hut with a working jetty and moored boats.
  const dock=group(-72,38,2.1);dock.rotation.y=-0.5;
  for(let i=0;i<25;i++) box(dock,1.15,0.4,9,-i*1.2,0,0,i%3?C.oak:0x926338,'wood');
  for(let i=0;i<7;i++) for(const z of [-4,4]) {
    cyl(dock,0.4,6,-i*4.4,-1.5,z,C.wood);cyl(dock,0.55,0.22,-i*4.4,1.55,z,C.light);
    if(i<6) box(dock,4.4,0.18,0.18,-i*4.4-2.2,1.1,z,C.wood);
  }
  const fishery=building(-65,34,{w:9,d:7,h:6,rot:-0.5,variant:3,color:C.blue});
  landmarks.docks={x:-65,z:34,y:fishery.position.y+11};
  for(let i=0;i<4;i++) {crate(dock,-3-i*2,1);barrel(dock,-7-i*2,-2);}
  const boats=[];
  for(let i=0;i<3;i++) {
    const g=new THREE.Group();g.position.set(-85-i*5,0.6,45+i*5);g.rotation.y=-0.5;scene.add(g);boats.push(g);
    const hull=new THREE.Mesh(new THREE.SphereGeometry(2,10,6),mat(C.oak));hull.scale.set(2.5,0.65,1);g.add(hull);
    box(g,6.8,0.25,2.4,0,0.6,0,C.wood,'wood');box(g,0.18,7,0.18,0,3.8,0,C.wood);
    const sail=mesh(g,new THREE.PlaneGeometry(3.4,4.6),C.light);sail.material=mat(C.light).clone();sail.material.side=THREE.DoubleSide;sail.position.set(1.5,4.1,0);
  }
  // Connected, staggered paving follows the gaps between lots. Tile positions are deduped.
  const paved=new Set();
  function paving(x,z) {
    const k=`${Math.round(x*2)},${Math.round(z*2)}`;if(paved.has(k)||height(x,z)<2)return;paved.add(k);
    const tile=box(root,1.3,0.16,1.4,x,height(x,z)+0.15,z,seeded(x,z)>0.5?0xc0b395:0xd1c3a5,'stone');
    tile.rotation.y=(seeded(x,z+4)-0.5)*0.4;
  }
  function paveCurve(curve) {
    const points=curve.getSpacedPoints(Math.ceil(curve.getLength()/1.35));
    points.forEach((p,i)=>{
      const next=points[Math.min(i+1,points.length-1)],prev=points[Math.max(0,i-1)];
      const dx=next.x-prev.x,dz=next.z-prev.z,len=Math.hypot(dx,dz)||1;
      for(const side of [-0.65,0.65]) paving(p.x-dz/len*side,p.z+dx/len*side);
    });
  }
  paveCurve(lane);
  // Short bent approaches follow each front door, rather than crossing a rigid grid.
  for(const [i,[x,z]] of [...frontages,[-5,8],[17,17],[17,-7],...areas.map(a=>[a.x,a.z])].entries()) {
    const p=closestLane(x,z);
    const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(x,0,z),
      new THREE.Vector3((x+p.x)/2+(seeded(i,15)-0.5)*2,0,(z+p.z)/2+(seeded(i,16)-0.5)*2),p.clone()]);
    paveCurve(curve);
  }
  // Small trees, planted verges and retaining walls soften the edges of the blocks.
  for(let i=0;i<30;i++) {
    const a=(i+seeded(i,20)*0.6)/30*Math.PI*2, r=61+seeded(i,21)*6,x=Math.cos(a)*r,z=Math.sin(a)*r;
    if(areas.some(p=>Math.hypot(p.x-x,p.z-z)<10))continue;
    const g=group(x,z);cyl(g,0.35,3.4,0,1.7,0,C.wood);ball(g,2.4,0,4.8,0,0x619447);ball(g,1.9,1,5.7,0,0x7fa64c);
    flowers(g,-2.5,0.3,0,1.8);
  }
  for(let i=0;i<52;i++) {
    const a=i/52*Math.PI*2,x=Math.cos(a)*67,z=Math.sin(a)*67;
    if(areas.some(p=>Math.hypot(p.x-x,p.z-z)<9)||i%13<2)continue;
    const g=group(x,z);g.rotation.y=-a;
    box(g,1.7,1.5,6.4,0,0.6,0,C.stone,'stone');box(g,2,0.3,6.6,0,1.5,0,C.light);
  }
  if(NIGHT){
    const lampMaterial=new THREE.MeshBasicMaterial({color:0xffd385});
    for(let i=0;i<14;i++){
      const p=lane.getPoint(i/14),x=p.x+2,z=p.z+2,y=height(x,z),g=group(x,z);
      cyl(g,.18,6,0,3,0,0x39414e);box(g,1.3,.2,.9,0,6.2,0,0x39414e);box(g,.6,.9,.6,0,5.65,0,0xffd385);
      const bulb=ball(g,.8,0,5.6,0,0xffd385);bulb.material=lampMaterial;
      if(i%5===0){const light=new THREE.PointLight(0xffbb63,80,24,2);light.position.set(x,y+4,z);scene.add(light);}
    }
  }
  // Merge static geometry by material, including all architectural surface detail.
  root.updateMatrixWorld(true);const buckets=new Map();
  root.traverse(o=>{if(!o.isMesh)return;const geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();geo.applyMatrix4(o.matrixWorld);const list=buckets.get(o.material)||[];list.push(geo);buckets.set(o.material,list);o.geometry.dispose();});
  for(const [material,parts] of buckets) {
    const geo=mergeGeometries(parts);parts.forEach(g=>g.dispose());const m=new THREE.Mesh(geo,material);m.castShadow=m.receiveShadow=true;scene.add(m);
  }
  // Subtle ambient motion: chimney smoke, moored boats and wind-driven pennants.
  const smoke=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshBasicMaterial({color:0xe7dfcc,transparent:true,opacity:0.23,depthWrite:false}),smokeOrigins.length*4);
  smoke.frustumCulled=false;scene.add(smoke);const dummy=new THREE.Object3D();
  const flag=new THREE.Mesh(new THREE.PlaneGeometry(2.5,1.4,6,2),mat(C.blue));flag.material=flag.material.clone();flag.material.side=THREE.DoubleSide;
  flag.position.set(-3.7,hall.position.y+24,-4.8);scene.add(flag);flags.push(flag);
  // Ambient townspeople are scenery, separate from the simulation's colored agent bodies.
  for(let i=0;i<20;i++) {
    const g=new THREE.Group();scene.add(g);const color=[0x447f97,0xa85943,0xd9b66d,0x6d8860][i%4];
    const body=new THREE.Mesh(new THREE.ConeGeometry(0.45,1.2,7),mat(color));body.position.y=1;g.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(0.32,7,5),mat(0xe9bc8e));head.position.y=1.9;g.add(head);
    for(const side of [-1,1]) box(g,0.19,0.55,0.24,side*0.2,0.28,0,C.wood);
    residents.push({g,line:[-30,30][i%2],offset:seeded(i,3),speed:0.004+seeded(i,4)*0.003});
  }
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  return {landmarks,stats:{buildings:buildingCount,staticDraws:buckets.size},update(time) {
    const t=reduced.matches?0:time;
    for(let j=0;j<smokeOrigins.length;j++) for(let k=0;k<4;k++) {
      const p=(t*0.22+k/4+j*0.13)%1,origin=smokeOrigins[j];
      dummy.position.set(origin.x+p*2,origin.y+p*7,origin.z+Math.sin(p*4+j)*0.5);dummy.scale.setScalar(0.3+p*1.2);dummy.updateMatrix();smoke.setMatrixAt(j*4+k,dummy.matrix);
    }
    smoke.instanceMatrix.needsUpdate=true;
    boats.forEach((g,i)=>{g.position.y=0.6+Math.sin(t*1.4+i)*0.12;g.rotation.z=Math.sin(t+i)*0.025;});
    for(const f of flags) {const p=f.geometry.attributes.position;for(let i=0;i<p.count;i++)p.setZ(i,Math.sin(p.getX(i)*2+t*3)*0.16);p.needsUpdate=true;}
    residents.forEach((r,i)=>{
      const u=(r.offset+t*r.speed)%1,p=lane.getPointAt(u),tangent=lane.getTangentAt(u);
      r.g.position.set(p.x,height(p.x,p.z)+Math.abs(Math.sin(t*4+i))*0.04,p.z);
      r.g.rotation.y=Math.atan2(tangent.x,tangent.z);
    });
  }};
}
