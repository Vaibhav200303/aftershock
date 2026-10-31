import * as THREE from 'three';
import {subscribeDisasters} from './state.js';
const seed=i=>{const x=Math.sin(i*127.1+93.2)*43758.5453;return x-Math.floor(x);};
// Fixed particle pools: no per-frame allocation, lights, physics, or shadow passes.
export function createDisasterEffects({scene,height,areas,sun,hemi,water,land}){
 const root=new THREE.Group();root.name='Disaster atmosphere';scene.add(root);
 let target={},lastTime=null;const weights={},pools=[];
 const off=subscribeDisasters(s=>{target=s;});
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 const origin=id=>{const a=areas.find(a=>a.id===id);return new THREE.Vector3(a.x,height(a.x,a.z)+2,a.z);};
 const forest=origin('forest'),market=origin('market'),dock=origin('docks');
 // Put the fire at the forest edge rather than underneath the work-location roof.
 const forestAngle=Math.atan2(forest.z,forest.x)+.25,forestRadius=Math.hypot(forest.x,forest.z);
 forest.x=Math.cos(forestAngle)*forestRadius;forest.z=Math.sin(forestAngle)*forestRadius;
 for(let n=0;n<12&&height(forest.x,forest.z)<3;n++){forest.x*=.94;forest.z*=.94;}
 forest.y=height(forest.x,forest.z)+3;
 function particles(id,count,color,size,kind,center){
  const geo=new THREE.BufferGeometry(),positions=new Float32Array(count*3);
  geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const mat=new THREE.PointsMaterial({color,size,transparent:true,opacity:0,depthWrite:false,sizeAttenuation:true});
  // Soft round sprites without loading an image or introducing a texture fetch.
  mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );','float r = length(gl_PointCoord - vec2(0.5)); if(r > 0.5) discard; vec4 diffuseColor = vec4(diffuse, opacity * smoothstep(0.5, 0.12, r));');};
  const mesh=new THREE.Points(geo,mat);mesh.frustumCulled=false;root.add(mesh);pools.push({id,count,positions,geo,mat,mesh,kind,center});
 }
 particles('coldsnap',300,0xe8f6ff,1.4,'snow');
 particles('blight',65,0xa6c84c,1.7,'spores',market);
 particles('forestfire',55,0xffb53c,1.1,'embers',forest);
 particles('forestfire',28,0x716e65,12,'smoke',forest);
 particles('hurricane',60,0x9baf55,1.5,'leaves');
 // Rain is a single line batch, with actual diagonal streaks rather than round dots.
 const rainGeo=new THREE.BufferGeometry(),rainPos=new Float32Array(360*6);
 rainGeo.setAttribute('position',new THREE.BufferAttribute(rainPos,3));
 const rainMat=new THREE.LineBasicMaterial({color:0xc3dfec,transparent:true,opacity:0,depthWrite:false});
 const rain=new THREE.LineSegments(rainGeo,rainMat);rain.frustumCulled=false;root.add(rain);
 const flames=new THREE.InstancedMesh(new THREE.ConeGeometry(1,1,5),new THREE.MeshBasicMaterial({color:0xff671e,transparent:true,opacity:0,depthWrite:false}),18);root.add(flames);flames.frustumCulled=false;
 const transform=new THREE.Object3D();
 const rings=new THREE.Group();root.add(rings);
 for(let i=0;i<3;i++){
  const ring=new THREE.Mesh(new THREE.TorusGeometry(3,.12,4,32),new THREE.MeshBasicMaterial({color:0xc5e5d7,transparent:true,opacity:0,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.set(dock.x-9-i*6,.5,dock.z+i*4);rings.add(ring);
 }
 const coins=new THREE.Group();coins.position.copy(market).add(new THREE.Vector3(0,12,0));root.add(coins);
 for(let i=0;i<4;i++){const coin=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.1,.22,12),new THREE.MeshBasicMaterial({color:0xd9b35a,transparent:true,opacity:0}));coin.rotation.x=Math.PI/2;coin.position.x=(i-1.5)*3;coins.add(coin);}
 // A thin frost tint on upward-facing warm roof/timber surfaces; shared uniform,
 // no duplicate building meshes, and no changes to their geometry or positions.
 const frost={value:0},patched=[];
 scene.traverse(o=>{const m=o.material;if(!m?.isMeshStandardMaterial||!m.color||m===land.material||patched.some(p=>p.m===m))return;
 if(m.color.r<m.color.g*1.2||m.color.g<m.color.b*1.05)return;
 const before=m.onBeforeCompile,cache=m.customProgramCacheKey;
 m.onBeforeCompile=shader=>{before.call(m,shader);shader.uniforms.uDisasterFrost=frost;
 shader.vertexShader='varying float vDisasterUp;\n'+shader.vertexShader;
 shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvDisasterUp = max(0.0, (mat3(modelMatrix) * normal).y);');
 shader.fragmentShader='uniform float uDisasterFrost; varying float vDisasterUp;\n'+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8,0.9,0.98), smoothstep(0.35,0.8,vDisasterUp)*uDisasterFrost*0.85);');};
 m.customProgramCacheKey=()=>cache.call(m)+'-disaster-frost';m.needsUpdate=true;patched.push({m,before,cache});});
 const deep=water.uDeep.value.clone(),mid=water.uMid.value.clone(),shallow=water.uShallow.value.clone();
 const cool=new THREE.Color(0xc4e0ff),warm=new THREE.Color(0xfff1cf),storm=new THREE.Color(0xaec7d9),fire=new THREE.Color(0xffca81);
 const mutedDeep=new THREE.Color(0x387e89),mutedMid=new THREE.Color(0x63a3a4),mutedShallow=new THREE.Color(0x96c4b5);
 return {
 get weather(){return weights;},
 update(time,lowPower,baseSun=2.35){
  const dt=Math.min(.15,lastTime==null?0:time-lastTime);lastTime=time;
  for(const id of ['famine','blight','coldsnap','forestfire','hurricane','crunch'])weights[id]=(weights[id]||0)+((target[id]||0)-(weights[id]||0))*(motion.matches?1:1-Math.exp(-dt*1.6));
  // Reduced motion retains the state and color feedback without falling/flickering motion.
  const t=motion.matches?0:time;
  for(const p of pools){const w=weights[p.id];p.mesh.visible=w>.003;if(!p.mesh.visible)continue;
   p.geo.setDrawRange(0,motion.matches?Math.min(20,p.count):lowPower?Math.ceil(p.count*.5):p.count);
   p.mat.opacity=w*(p.kind==='smoke'?.22:.7);
   for(let i=0;i<p.count;i++){
    const k=i*3,a=seed(i+1),b=seed(i+500),c=seed(i+900);let x,y,z;
    if(p.kind==='snow'){x=(a-.5)*205+Math.sin(t*.35+i)*3;z=(b-.5)*205;y=8+((c*65-t*(2+a)+100000)%65);}
    else if(p.kind==='leaves'){x=((a*220+t*14)%220)-110;z=(b-.5)*190+Math.sin(t+i)*4;y=8+c*24+Math.sin(t*2+i)*3;}
    else {x=p.center.x+(a-.5)*(p.kind==='spores'?24:16)+Math.sin(t+i)*2;z=p.center.z+(b-.5)*18;y=p.center.y+((c*24+t*(p.kind==='smoke'?3:2))%24);}
    p.positions[k]=x;p.positions[k+1]=Math.max(height(x,z)+1,y);p.positions[k+2]=z;
   }p.geo.attributes.position.needsUpdate=true;
  }
  const h=weights.hurricane,c=weights.coldsnap,f=weights.forestfire;
  frost.value=c;
  rain.visible=h>.003&&!motion.matches;rainMat.opacity=h*.4;
  if(rain.visible){rainGeo.setDrawRange(0,lowPower?240:720);for(let i=0;i<360;i++){const k=i*6,x=((seed(i)*240+t*20)%240)-120,z=(seed(i+800)-.5)*220,y=10+((seed(i+400)*80-t*45+100000)%80);rainPos[k]=x;rainPos[k+1]=y;rainPos[k+2]=z;rainPos[k+3]=x-2;rainPos[k+4]=y+5;rainPos[k+5]=z-.5;}rainGeo.attributes.position.needsUpdate=true;}
  flames.visible=f>.003;flames.material.opacity=f*.85;
  if(flames.visible){for(let i=0;i<18;i++){let x=forest.x+(seed(i)-.5)*17,z=forest.z+(seed(i+50)-.5)*14;for(let n=0;n<12&&height(x,z)<3;n++){x*=.94;z*=.94;}transform.position.set(x,height(x,z)+4,z);transform.scale.set(1.7,7+Math.sin(t*5+i)*1.3,1.7);transform.updateMatrix();flames.setMatrixAt(i,transform.matrix);}flames.instanceMatrix.needsUpdate=true;}
  rings.visible=weights.famine>.003;rings.children.forEach((r,i)=>{r.material.opacity=weights.famine*.45;r.scale.setScalar(1+((t*.12+i*.33)%1)*.6);});
  coins.visible=weights.crunch>.003;coins.children.forEach((coin,i)=>{coin.material.opacity=weights.crunch*.8;coin.position.y=Math.sin(t*.6+i)*.5;});
  sun.color.copy(warm).lerp(cool,c*.65).lerp(storm,h*.6).lerp(fire,f*.15);
  sun.intensity=baseSun* (1-h*.3-c*.12);hemi.intensity=.95-h*.18;
  water.uStorm.value=h;const dull=Math.max(weights.famine*.65,h*.5);
  water.uDeep.value.copy(deep).lerp(mutedDeep,dull);water.uMid.value.copy(mid).lerp(mutedMid,dull);water.uShallow.value.copy(shallow).lerp(mutedShallow,dull);
  land.material.color.setRGB(1-c*.08,1-c*.02,1);land.material.emissive.setRGB(c*.14,c*.19,c*.24);land.material.emissiveIntensity=c*.55;
 },
 dispose(){off();for(const {m,before,cache} of patched){m.onBeforeCompile=before;m.customProgramCacheKey=cache;m.needsUpdate=true;}scene.remove(root);root.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});water.uDeep.value.copy(deep);water.uMid.value.copy(mid);water.uShallow.value.copy(shallow);water.uStorm.value=0;}
 };
}
