import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

// Bounded half-resolution contact shading; full-resolution color and edge antialiasing.
// Changes render targets only, never the scene's objects or camera composition.
export function createRenderQuality(renderer,scene,camera) {
  const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType});
  target.samples=renderer.capabilities.isWebGL2?4:0;
  const composer=new EffectComposer(renderer,target);
  const render=new RenderPass(scene,camera),ao=new SSAOPass(scene,camera,1,1,12);
  ao.kernelRadius=3.1;ao.minDistance=0.000045;ao.maxDistance=0.0014;
  ao.ssaoMaterial.fragmentShader=ao.ssaoMaterial.fragmentShader.replace('1.0 - occlusion','1.0 - occlusion * 0.55');
  const grade=new ShaderPass({uniforms:{tDiffuse:{value:null}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`uniform sampler2D tDiffuse;varying vec2 vUv;void main(){
      vec4 c=texture2D(tDiffuse,vUv);float l=dot(c.rgb,vec3(0.2126,0.7152,0.0722));
      c.rgb=mix(vec3(l),c.rgb,1.07);gl_FragColor=vec4(max(c.rgb,0.0),c.a);
    }`});
  const output=new OutputPass(),fxaa=new ShaderPass(FXAAShader);
  [render,ao,grade,output,fxaa].forEach(p=>composer.addPass(p));
  return {resize(w,h,ratio){
    composer.setPixelRatio(ratio);composer.setSize(w,h);
    ao.setSize(Math.max(1,Math.round(w*ratio*0.5)),Math.max(1,Math.round(h*ratio*0.5)));
    fxaa.material.uniforms.resolution.value.set(1/(w*ratio),1/(h*ratio));
  },render(){composer.render();},dispose(){
    [render,ao,grade,output,fxaa].forEach(p=>p.dispose?.());composer.dispose();
  }};
}
