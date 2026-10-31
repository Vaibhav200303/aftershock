import * as THREE from 'three';
let fabric;
export function plushMaterial(color=0xffffff){
 if(!fabric){const cv=document.createElement('canvas');cv.width=cv.height=256;const g=cv.getContext('2d');g.fillStyle='#bebebe';g.fillRect(0,0,256,256);
 for(let i=0;i<18000;i++){const n=Math.sin(i*127.1)*43758.5453,r=n-Math.floor(n),m=Math.sin(i*311.7)*19341.7,s=m-Math.floor(m);g.strokeStyle=i%2?'#e2e2e2':'#929292';g.lineWidth=.5;g.beginPath();g.moveTo(r*256,s*256);g.lineTo(r*256+Math.sin(i)*1.8,s*256+1.8);g.stroke();}
 fabric=new THREE.CanvasTexture(cv);fabric.wrapS=fabric.wrapT=THREE.RepeatWrapping;fabric.repeat.set(6,5);fabric.anisotropy=4;fabric.colorSpace=THREE.NoColorSpace;}
 return new THREE.MeshPhysicalMaterial({color,roughness:.97,metalness:0,bumpMap:fabric,bumpScale:.014,sheen:.8,sheenColor:0xfff3e6,sheenRoughness:.95});
}
