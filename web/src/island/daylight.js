import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// One sun direction is shared by the visible sky, cloud shading, water and town shadows.
export const SUN_DIRECTION = new THREE.Vector3(-90, 130, 70).normalize();
export const DAYLIGHT = { horizon:0x9bc9e3, zenith:0x4c9bd0, sea:0x258da9 };

export function addDaylight(scene) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(5000,32,20),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,toneMapped:true,
    uniforms:{uSun:{value:SUN_DIRECTION},uHorizon:{value:new THREE.Color(DAYLIGHT.horizon)},uZenith:{value:new THREE.Color(DAYLIGHT.zenith)}},
    vertexShader:`varying vec3 vDirection;
      void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`varying vec3 vDirection;uniform vec3 uSun,uHorizon,uZenith;
      void main(){
        vec3 dir=normalize(vDirection);
        vec3 col=mix(uHorizon,uZenith,smoothstep(0.0,0.8,dir.y));
        float alignment=max(dot(dir,uSun),0.0);
        col=mix(col,vec3(1.0,0.91,0.67),pow(alignment,24.0)*0.22);
        col=mix(col,vec3(1.0,0.97,0.78),smoothstep(0.99945,0.9998,alignment));
        gl_FragColor=vec4(col,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  sky.renderOrder=-10;scene.add(sky);
  // Puffy, sculpted cloud silhouettes. Their undersides receive sky bounce, never a second sun.
  const cloudMaterial=new THREE.MeshStandardMaterial({color:0xfffdf3,roughness:1});
  const clouds=[];
  const positions=[[-102,-83,21,0.85],[-26,-137,24,1.1],[73,-116,19,0.8],[147,-39,22,1.05],
    [150,108,20,0.75],[32,176,23,0.9],[-124,146,20,1],[-153,22,24,0.8]];
  for(let i=0;i<positions.length;i++) {
    const [x,z,y,scale]=positions[i];
    const parts=[];
    for(let k=0;k<7;k++) {
      const geo=new THREE.SphereGeometry(1,12,9);
      const px=(k-3)*3.3,py=[0,1.2,2.8,3.5,2.5,0.8,-0.2][k];
      geo.scale(4.8,3.2+(k%3)*0.8,4.7);geo.translate(px,py,(k%2)*1.8);parts.push(geo);
    }
    const geo=mergeGeometries(parts);parts.forEach(g=>g.dispose());
    const cloud=new THREE.Mesh(geo,cloudMaterial);cloud.position.set(x*3,y+64,z*3);cloud.scale.setScalar(scale*1.8);
    cloud.rotation.y=i*0.9;cloud.castShadow=false;scene.add(cloud);clouds.push({cloud,x:x*3,z:z*3});
  }
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const zenith=new THREE.Color(DAYLIGHT.zenith),horizon=new THREE.Color(DAYLIGHT.horizon),overcast=new THREE.Color(0x7395a7),cloudWhite=cloudMaterial.color.clone();
  let previous=null,wind=0;
  return {update(time,weather={}){
    const t=reduced.matches?0:time;
    const storm=weather.hurricane||0;
    const dt=Math.min(.15,previous==null?0:time-previous);previous=time;
    if(!reduced.matches)wind+=dt*storm*.4;
    sky.material.uniforms.uZenith.value.copy(zenith).lerp(overcast,storm*.8);
    sky.material.uniforms.uHorizon.value.copy(horizon).lerp(overcast,storm*.55);
    cloudMaterial.color.copy(cloudWhite).lerp(overcast,storm*.5);
    clouds.forEach(({cloud,x,z},i)=>{cloud.position.x=x+Math.sin(t*0.018+wind+i)*(3+storm*8);cloud.position.z=z+Math.cos(t*0.013+wind+i)*(2+storm*5);});
  }};
}
