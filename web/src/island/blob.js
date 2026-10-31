// Dot villagers: one stable visual identity shared by the island and portrait painters.
// island3d.js builds the instanced 3D bodies
// from it (an instanced lathe, a canvas face atlas, hats); the place card's lineup draws the
// same villager flat, from the same id — same build, same features, same hat, same mood.
import { SplineCurve, Vector2, LatheGeometry, CylinderGeometry, SphereGeometry, ConeGeometry, TorusGeometry, Color, BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// the dot's rounded silhouette, [radius, height] from the ground up; the lathe turns it, the lineup mirrors it
export const BLOB_PROFILE = [[0,0],[0.3,0.025],[0.49,0.10],[0.59,0.30],[0.61,0.56],
  [0.55,0.80],[0.40,1.01],[0.22,1.10],[0,1.13]];

export const rand = (id, salt) => { const v = Math.sin((id + 1) * (12.9898 + salt * 17.31)) * 43758.5453; return v - Math.floor(v); };

// ---- what a villager looks like -------------------------------------------------
// The face atlas: a column per mood, twice over (eyes open, eyes shut for the blink), and
// a row per set of features. A villager keeps its row for life and moves along it.
export const FACE_CELL = 128, FACE_LOOKS = 6, FACE_COLS = 12;
export const HAPPY = 0, GRIN = 1, NEUTRAL = 2, WORRIED = 3, SAD = 4, DECIDING = 5;
// plain, wide-eyed, spectacled, rosy and close-set, heavy-browed
export const LOOKS = [
  {dx:25,r:8.5,oval:true}, {dx:27,r:8.5,oval:true}, {dx:26,r:7.5,specs:true},
  {dx:24,r:9.5,blush:true}, {dx:26,r:8.5,oval:true}, {dx:25,r:8.5,oval:true}
];
export const DOT_PERSONAS = [
  {name:'Calm',color:'#f3eee8',look:0,extra:-1},
  {name:'Curious',color:'#35c9bd',look:1,extra:1},
  {name:'Thoughtful',color:'#f3c83c',look:2,extra:-1},
  {name:'Sunny',color:'#f78b2d',look:3,extra:4},
  {name:'Bold',color:'#3296ed',look:4,extra:3},
  {name:'Playful',color:'#f073b0',look:5,extra:2}
];
export function drawFace(g, mood, look, blink, raisedEyes=false) {
  const L = LOOKS[look], cx = FACE_CELL / 2, ey = 44;
  const gaze = mood === DECIDING ? [4, -5] : [0, 0];
  g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = g.fillStyle = "#0b0b0d";
  if (L.blush) { g.fillStyle = "#ef7f93"; [-1, 1].forEach(s => { g.beginPath(); g.arc(cx + s * 40, 66, 9, 0, Math.PI * 2); g.fill(); }); g.fillStyle = "#0b0b0d"; }
  [-1, 1].forEach(s => {
    const x = cx + s * L.dx;
    g.beginPath();
    if(!raisedEyes) {
    if (blink) { g.lineWidth = 4.5; g.moveTo(x - L.r, ey + 1); g.lineTo(x + L.r, ey + 1); g.stroke(); }
    else { g.ellipse(x+gaze[0],ey+gaze[1],L.r,L.oval?L.r*1.35:L.r,0,0,Math.PI*2);g.fill();
      g.fillStyle='#fffaf0';g.beginPath();g.arc(x+gaze[0]-L.r*0.24,ey+gaze[1]-L.r*0.3,2.2,0,Math.PI*2);g.fill();g.fillStyle='#0b0b0d'; }
    }
    if (L.specs && !raisedEyes) { g.lineWidth = 4; g.beginPath(); if(L.square) g.roundRect(x-18,ey-15,36,30,6);else g.arc(x,ey,18,0,Math.PI*2); g.stroke(); }
    // brows: the heavy-browed always wear them; trouble puts them on everyone, inner ends up
    const tilt = mood === WORRIED || mood === SAD ? 7 : mood === DECIDING ? -3 * s : 0;
    if (L.brows || tilt) {
      g.lineWidth = L.brows ? 7 : 4.5;
      const by = ey - L.r - (L.specs ? 16 : 9);
      g.beginPath(); g.moveTo(x - s * 11, by - tilt); g.lineTo(x + s * 11, by + (tilt > 0 ? 2 : 0)); g.stroke();
    }
  });
  if (L.specs && !raisedEyes) { g.lineWidth = 4; g.beginPath(); g.moveTo(cx - L.dx + 17, ey); g.lineTo(cx + L.dx - 17, ey); g.stroke(); }
  g.lineWidth = 5.5;
  g.beginPath();
  if (mood === HAPPY) { g.arc(cx, 70, 15, Math.PI * 0.14, Math.PI * 0.86); g.stroke(); }
  else if (mood === GRIN) { g.arc(cx, 70, 17, 0, Math.PI); g.closePath(); g.fill(); g.stroke(); }
  else if (mood === NEUTRAL) { g.moveTo(cx - 10, 80); g.lineTo(cx + 10, 80); g.stroke(); }
  else if (mood === WORRIED) { g.moveTo(cx - 13, 82); g.quadraticCurveTo(cx - 6, 74, cx, 82); g.quadraticCurveTo(cx + 6, 90, cx + 13, 82); g.stroke(); }
  else if (mood === SAD) {
    g.arc(cx, 96, 15, Math.PI * 1.17, Math.PI * 1.83); g.stroke();
    if (!blink) { g.fillStyle = "#7fd0ff"; g.beginPath(); g.arc(cx - L.dx - 3, ey + L.r + 12, 5.5, 0, Math.PI * 2); g.fill(); }
  }
  else { g.moveTo(cx + 2, 81); g.lineTo(cx + 15, 78); g.stroke(); }
}
// Read off /state the same way the villager cards do: want first, then worry, then the rest.
export const moodOf = (a) => a.hunger >= 3 || a.cold >= 2 ? SAD
  : a.hunger > 0 || (a.debt > 0 && a.dueIn != null && a.dueIn <= 2) ? WORRIED
  : a.activity === 'deciding' ? DECIDING
  : a.house ? GRIN
  : a.debt > 0 ? NEUTRAL : HAPPY;
// a body of its own, fixed by the id: proportions, a lean, a row of the atlas, maybe a hat
export const BLOB = 2;                                          // world units per unit of blob: ~2.4 tall, half a cabin
const identities=new Map();
export const bodyOf = id => {
  if(identities.has(id)) return identities.get(id);
  const persona=DOT_PERSONAS[Math.floor(rand(id,22)*DOT_PERSONAS.length)];
  const rgb=new Color(persona.color);
  const identity={tall:0.93+rand(id,20)*0.13,girth:0.96+rand(id,21)*0.12,
    leanX:(rand(id,24)-0.5)*0.06,leanZ:(rand(id,25)-0.5)*0.08,
    look:persona.look,extra:persona.extra,color:persona.color,persona:persona.name,rgb:[rgb.r,rgb.g,rgb.b],
    phase:rand(id,26)*6.283,aside:(rand(id,27)-0.5)*0.6,blinkEvery:2.8+rand(id,28)*3};
  if(identities.size>512) identities.clear();identities.set(id,identity);return identity;
};

// ---- the model's parts, built once ---------------------------------------------------
// One rounded dot body (a lathe of BLOB_PROFILE); the face, a patch of that same lathe a hair
// proud of the skin, facing +z; the face atlas it is textured from (mood across, twice over
// for the blink; the villager's own features down); and the hats, modelled in the body's
// space so they take the body's matrix as it is. The island instances these; the lineup's
// portrait renderer (blob3d.js) draws them one villager at a time.
let PARTS = null;
export function blobParts() {
  if (PARTS) return PARTS;
  const prof = new SplineCurve(BLOB_PROFILE.map(([r, y]) => new Vector2(r, y))).getSpacedPoints(20);
  prof.forEach(q => { q.x = Math.max(0, q.x); });
  prof[0].x = prof[prof.length - 1].x = 0;
  const bodyGeo = new LatheGeometry(prof, 28);
  const skin = prof.filter(q => q.y > 0.35 && q.y < 1.02).map(q => new Vector2(q.x + 0.014, q.y));
  const faceGeo = new LatheGeometry(skin, 16, -0.8, 1.6);

  const g = document.createElement("canvas").getContext("2d");
  g.canvas.width = FACE_CELL * FACE_COLS; g.canvas.height = FACE_CELL * FACE_LOOKS;
  for (let look = 0; look < FACE_LOOKS; look++) for (let mood = 0; mood < 6; mood++) for (let blink = 0; blink < 2; blink++) {
    g.save();
    g.translate((mood * 2 + blink) * FACE_CELL, look * FACE_CELL);
    g.beginPath(); g.rect(0, 0, FACE_CELL, FACE_CELL); g.clip();
    drawFace(g, mood, look, blink, true);
    g.restore();
  }

  const at = (geo, x, y, z, rz = 0, sx = 1, sy = 1, sz = 1) => geo.scale(sx, sy, sz).rotateZ(rz).translate(x, y, z);
  const extras = [
    {color:0x70bd30,geo:mergeGeometries([
      at(new CylinderGeometry(.025,.03,.18,8),0,1.19,0),
      at(new SphereGeometry(.16,12,8),.12,1.31,0,.55,1,.38,.55),
      at(new SphereGeometry(.16,12,8),-.12,1.31,0,-.55,1,.38,.55)])},
    {color:0x2855b9,geo:mergeGeometries([
      at(new SphereGeometry(.43,20,12,0,Math.PI*2,0,Math.PI/2),0,1.04,0,0,1,.65,1),
      at(new SphereGeometry(.39,16,8),.15,1.05,.30,-.08,1.15,.09,.8)])},
    {color:0xe73588,geo:mergeGeometries([
      at(new SphereGeometry(.22,14,10),.17,1.15,.03,.45,1,.62,.55),
      at(new SphereGeometry(.22,14,10),-.17,1.15,.03,-.45,1,.62,.55),
      at(new SphereGeometry(.10,12,8),0,1.15,.12)])},
    {color:0x232126,geo:mergeGeometries([
      at(new SphereGeometry(.50,20,12),-.09,1.07,0,.18,1.05,.25,.88),
      at(new CylinderGeometry(.03,.04,.10,8),-.12,1.23,0,.2)])},
    {color:0xfff5de,geo:mergeGeometries(Array.from({length:5},(_,i)=>{
      const a=i/5*Math.PI*2;return at(new SphereGeometry(.105,12,8),-.27+Math.cos(a)*.12,1.04+Math.sin(a)*.12,.33,a,1,.65,.55);
    }))}
  ];
  const eyeGeo=mergeGeometries([-1,1].map(side=>at(new SphereGeometry(1,12,10),side*.205,0,.53,0,.052,.092,.048)));
  const specsGeo=mergeGeometries([
    ...[-1,1].map(side=>at(new TorusGeometry(.125,.016,7,22),side*.205,.76,.585)),
    at(new CylinderGeometry(.014,.014,.17,7),0,.76,.585,Math.PI/2)
  ]);
  // Fine short fibers add a soft silhouette, shared and instanced like the body.
  const fibers=[];
  for(let i=0;i<1100;i++){
    const t=rand(i,71)*(prof.length-2)+.5,j=Math.floor(t),f=t-j;
    const a=prof[j],b=prof[j+1],r=a.x+(b.x-a.x)*f,y=a.y+(b.y-a.y)*f,ang=rand(i,72)*Math.PI*2;
    const p=new Vector3(Math.sin(ang)*r,y,Math.cos(ang)*r);
    const n=new Vector3(Math.sin(ang),-(b.x-a.x)/Math.max(.001,b.y-a.y),Math.cos(ang)).normalize();
    const tangent=new Vector3(Math.cos(ang),0,-Math.sin(ang));
    const left=p.clone().addScaledVector(tangent,-.002),right=p.clone().addScaledVector(tangent,.002);
    const tip=p.clone().addScaledVector(n,.012+rand(i,73)*.012).addScaledVector(tangent,.005);
    fibers.push(...left.toArray(),...right.toArray(),...tip.toArray());
  }
  const furGeo=new BufferGeometry();furGeo.setAttribute('position',new Float32BufferAttribute(fibers,3));furGeo.computeVertexNormals();
  const jobGeo=new SphereGeometry(0.075,10,8);jobGeo.translate(0,0.18,0.49);
  const badgeGeo=new SphereGeometry(0.095,10,8);badgeGeo.translate(0,0.18,0.45);
  return (PARTS = { bodyGeo, faceGeo, atlas: g.canvas, extras, jobGeo, badgeGeo, eyeGeo, specsGeo, furGeo });
}

// ---- the flat painter (the fallback where WebGL will not start) ----------------------------------------------------------------
const OUTLINE = new SplineCurve(BLOB_PROFILE.map(([r, y]) => new Vector2(r, y))).getSpacedPoints(40)
  .map(q => [Math.max(0, q.x), q.y]);
const radiusAt = y => { for (let i = 1; i < OUTLINE.length; i++) if (OUTLINE[i][1] >= y) return OUTLINE[i][0]; return 0; };

// Draw villager `id` standing on (cx, base), `unit` pixels to one unit of blob. Flat colour,
// one flat shade down the far side for form — no gradients. `dark` is that shade.
export function drawBlob(g, { id, mood, blink = false, color, dark, cx, base, unit }) {
  const B = bodyOf(id), W = B.girth * unit, H = B.tall * unit;
  g.save();
  g.translate(cx, base);
  g.rotate(B.leanZ * 0.6);
  const body = () => {
    g.beginPath();
    g.moveTo(0, 0);
    for (const [r, y] of OUTLINE) g.lineTo(r * W, -y * H);
    for (let i = OUTLINE.length - 1; i >= 0; i--) g.lineTo(-OUTLINE[i][0] * W, -OUTLINE[i][1] * H);
    g.closePath();
  };
  body(); g.fillStyle = B.color; g.fill();
  g.save(); body(); g.clip();                               // the shaded side: the same dot, slid across
  g.translate(W * 0.34, H * 0.05); body(); g.fillStyle = new Color(B.color).multiplyScalar(0.65).getStyle(); g.globalAlpha = 0.55; g.fill();
  g.restore();

  // the face: the atlas cell laid over the same band of the body the 3D patch covers
  const top = 1.02, bottom = 0.35, fw = 2 * Math.sin(0.8) * radiusAt(0.72) * W * 1.12, fh = (top - bottom) * H;
  g.save();
  g.translate(-fw / 2, -top * H);
  g.scale(fw / FACE_CELL, fh / FACE_CELL);
  drawFace(g, mood, B.look, blink);
  g.restore();

  if(B.extra===1){g.fillStyle='#2855b9';g.beginPath();g.ellipse(0,-1.07*H,.43*W,.22*H,0,Math.PI,Math.PI*2);g.fill();g.fillRect(-.2*W,-1.08*H,.78*W,.05*H);}
  if(B.extra===2){g.fillStyle='#e73588';for(const side of [-1,1]){g.beginPath();g.ellipse(side*.17*W,-1.15*H,.22*W,.13*H,-side*.45,0,Math.PI*2);g.fill();}}
  if(B.extra===3){g.fillStyle='#232126';g.beginPath();g.ellipse(-.09*W,-1.07*H,.53*W,.14*H,-.15,0,Math.PI*2);g.fill();}
  if(B.extra===4){g.fillStyle='#fff5de';for(let i=0;i<5;i++){const a=i/5*Math.PI*2;g.beginPath();g.ellipse((-.27+Math.cos(a)*.12)*W,-(1.04+Math.sin(a)*.12)*H,.10*W,.075*H,a,0,Math.PI*2);g.fill();}}
  g.fillStyle='#fffaf0';g.beginPath();g.arc(0,-0.23*H,0.15*W,0,Math.PI*2);g.fill();
  g.fillStyle=color;g.beginPath();g.arc(0,-0.23*H,0.11*W,0,Math.PI*2);g.fill();
  g.restore();
}
