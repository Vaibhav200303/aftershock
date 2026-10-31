import {NIGHT} from '../world/theme.js';
// <island-3d> — ported from frontend/island3d.js, unchanged except for four things:
//   * three is a real dependency now (`import * as THREE`) instead of a CDN dynamic import,
//   * the element reads the shared /state store instead of polling and opening its own SSE,
//   * `lowPower` throttles the frame rate while the scene is only the CCTV inset,
//   * every villager now moves on their OWN decision (src/island/pulse.js) rather than on
//     the poll or on a single global "the round settled" flag, which used to march the
//     whole village off together. /state is still the truth, but only for villagers who
//     have not already moved on an event of their own.
import * as THREE from 'three';
import {createDisasterEffects} from '../disasters/effects.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {plushMaterial} from './plushMaterial.js';
import { createRenderQuality } from './renderQuality.js';
import { addDaylight, SUN_DIRECTION, DAYLIGHT } from './daylight.js';
import { addStrategyVillage } from './strategyVillage.js';
import { subscribe } from '../store.js';
import { subscribeActs, subscribeUpdates, subscribeRound, owns, setPopulation } from './pulse.js';
import { rand, FACE_CELL, FACE_LOOKS, FACE_COLS, HAPPY, GRIN, NEUTRAL, WORRIED, SAD, DECIDING, drawFace, moodOf, BLOB, bodyOf, blobParts } from './blob.js';

// <island-3d>: an orbitable volcanic island, one blob per agent. Each round plays as a day:
// when a round settles everyone walks to the market (dusk), then back out to the area where
// their next shift happens. Blobs walk the coast road at a steady pace, on the ground.
// Drag to orbit, scroll to zoom, click a place to open it (dispatches "moku:location").
(function () {
  const SEA = 0;
  // Where each task happens. An agent that is deciding (no task yet this round) stays put.
  const AREAS = [
    { id: "docks",    name: "Docks", color: "#1f9fb5", x: -70, z: 38,  tasks: ["gather_food"] },
    { id: "forest",   name: "Forest", color: "#3f9450", x: 40,  z: -48, tasks: ["gather_wood"] },
    { id: "workshop", name: "Workshop", color: "#d98c2b", x: 60,  z: 8,   tasks: ["craft_net", "smoke_fish"] },
    { id: "site",     name: "Building site", color: "#cf6046", x: -16, z: -50, tasks: ["build_house"] },
    { id: "market",   name: "Market",                   color: "#8a8f98", x: 18,  z: 56,  tasks: ["idle"] },
  ];
  const MARKET = AREAS.at(-1);
  const areaOf = task => AREAS.find(a => a.tasks.includes(task));

  function hash2(x, y) {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return s - Math.floor(s);
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = smooth(xf), v = smooth(yf);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  function fbm(x, y, oct) {
    let amp = 0.5, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) { sum += amp * vnoise(x * freq, y * freq); norm += amp; amp *= 0.5; freq *= 2.03; }
    return sum / norm;
  }
  function sstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  // the raw landscape, with no road graded into it. ROAD is laid out on this field; height()
  // below is the same field with the road's corridor levelled, and is what everything draws on.
  function baseHeight(x, z) {
    const d = Math.hypot(x*(NIGHT?1.04:1), z*(NIGHT?.93:1));
    const ang = Math.atan2(z, x);
    const coast = fbm(Math.cos(ang) * 1.9 + 5, Math.sin(ang) * 1.9 + 9, 4);
    const R = 72 + coast * 22;
    // A broad playable meadow with a sculpted cliff shelf, rather than a volcano.
    const meadow = (NIGHT?5.8+Math.floor((x+85)/35)*1.1:7.5) + fbm(x * 0.025 + 11, z * 0.025 + 7, 3) * 1.8;
    return meadow * (1 - sstep(R - 15, R - 6, d))
      + 1.6 * sstep(R - 15, R - 6, d) * (1 - sstep(R - 4, R + 5, d))
      - 20 * sstep(R, R + 46, d);
  }

  // The coast road: a loop of waypoints just above the beach. Blobs walk area -> road -> along
  // it -> area, so nobody climbs the mountain or swims. ROAD_HALF_W is the ribbon's half-width
  // (see the "sandy ribbon" mesh below). Every lane offset below is clamped inside it, so a
  // blob's path and its standing spot both always stay on the road, never spilling into the grass.
  const ROAD_HALF_W = 3.2;
  // 2.2m is the top of the beach: walking in from the sea the raw ground first clears it about
  // 7 units inland of the waterline, still on the flat backshore. The loop stops right there
  // and takes no further step inland, which is what used to carry it up the hillside.
  const ROAD_LEVEL = 2.2;
  const ROAD = Array.from({ length: 36 }, (_, i) => {
    const t = i / 36 * Math.PI * 2;
    let r = 120;
    while (r > 10 && baseHeight(Math.cos(t) * r, Math.sin(t) * r) < ROAD_LEVEL) r--;
    return [Math.cos(t) * r, Math.sin(t) * r];
  });
  // the level the ground is graded to under each waypoint, so the path is level across its
  // width instead of tilted. Averaged with its neighbours so the road does not step from one
  // waypoint to the next, and never below ROAD_LEVEL so a dip can never take it into the sea.
  const ROAD_RAW_Y = ROAD.map(([x, z]) => baseHeight(x, z));
  const ROAD_Y = ROAD_RAW_Y.map((y, i) => Math.max(ROAD_LEVEL,
    (ROAD_RAW_Y[(i + 35) % 36] + 2 * y + ROAD_RAW_Y[(i + 1) % 36]) / 4));
  const nearestRoad = (x, z) => ROAD.reduce((best, p, i) =>
    Math.hypot(p[0] - x, p[1] - z) < Math.hypot(ROAD[best][0] - x, ROAD[best][1] - z) ? i : best, 0);
  // the nearest point on the road as a polyline (not just the nearest waypoint, which
  // under-measures on the straight stretch between two of them): how far off the road (x,z)
  // lies, and the level the road has been graded to there.
  function roadNear(x, z) {
    let best = Infinity, y = 0;
    for (let i = 0; i < ROAD.length; i++) {
      const j = (i + 1) % ROAD.length, [ax, az] = ROAD[i], [bx, bz] = ROAD[j];
      const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
      const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / len2));
      const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
      if (d < best) { best = d; y = ROAD_Y[i] + (ROAD_Y[j] - ROAD_Y[i]) * t; }
    }
    return { d: best, y };
  }
  // used to keep trees, grass and rocks from clipping through the ribbon
  const distToRoad = (x, z) => roadNear(x, z).d;
  const ROAD_R = ROAD.map(([x, z]) => Math.hypot(x, z));
  // how far from the centre the camera's focus slides when fully zoomed in: just inside the road
  const FOCUS_R = Math.min(...ROAD_R) * 0.86;
  const ROAD_R_IN = Math.min(...ROAD_R) - ROAD_HALF_W * 2, ROAD_R_OUT = Math.max(...ROAD_R) + ROAD_HALF_W * 2;
  // the raw field with the road's corridor graded flat across its width, easing back out to
  // 1.5x the ribbon's half-width so the cut meets the hillside without a step. Never build
  // ROAD from this one, it reads ROAD; use baseHeight. The pads below sit on top of it.
  function roadHeight(x, z) {
    const b = baseHeight(x, z);
    // the corridor only ever lies in a ring around the island, so the mountain, the lagoon and
    // the sea skip the polyline scan: this runs three times per terrain vertex
    const r = Math.hypot(x, z);
    if (r < ROAD_R_IN || r > ROAD_R_OUT) return b;
    const { d, y } = roadNear(x, z);
    return b + (y - b) * (1 - sstep(ROAD_HALF_W, ROAD_HALF_W * 1.5, d));
  }
  // the road's direction and sideways normal at waypoint i, so a lane offset can be applied
  // perpendicular to the road no matter which way it is curving at that point
  function roadFrame(i) {
    const n = ROAD.length, p = ROAD[i], nxt = ROAD[(i + 1) % n], prv = ROAD[(i - 1 + n) % n];
    const dx = nxt[0] - prv[0], dz = nxt[1] - prv[1], len = Math.hypot(dx, dz) || 1;
    const tx = dx / len, tz = dz / len;
    return { x: p[0], z: p[1], tx, tz, nx: -tz, nz: tx };
  }
  // Each destination stands on a graded pad beside the road. The raw slope runs several
  // units across a building's footprint here, and the dry strip seaward of the road is only
  // two or three units wide, so there is nowhere flat to stand: the village is terraced in
  // instead. Sited against the road's normal from the road-graded field, then cut into the
  // field everything is drawn on, the same two-pass order the road itself uses.
  const PADS = [
    { x: 40, z: -48, w: 4.4, d: 4 },      // forest: woodcutter's cabin
    { x: 60, z: 8, w: 6, d: 5 },          // workshop
    { x: -16, z: -50, w: 6, d: 4.8 },     // building site
    { x: 18, z: 56, w: 5.4, d: 4.4 }      // market stall
  ].map(p => {
    const f = roadFrame(nearestRoad(p.x, p.z));
    const span = Math.hypot(p.w, p.d);
    // inland of the ribbon by half a footprint plus clearance, on whichever side the area
    // itself lies, so the building fronts the road instead of standing in it
    const side = Math.sign((p.x - f.x) * f.nx + (p.z - f.z) * f.nz) || 1;
    const off = ROAD_HALF_W + span / 2 + 0.6;
    const x = f.x + f.nx * off * side, z = f.z + f.nz * off * side;
    // level with the road it fronts, so there is no step from the path to the door
    const y = roadHeight(f.x, f.z);
    // the deeper the cut into the hillside, the further the ease-out runs: a fixed skirt
    // leaves a near vertical bank behind the taller sites and the village reads as a quarry
    const cut = Math.abs(y - roadHeight(x, z));
    const r = span / 2 + 0.8;
    // cutting and filling need very different reaches. A cut runs out far so the bank behind
    // the building is a slope and not a quarry wall; a fill is kept to a tight skirt, since
    // out past the road the ground is dropping to the water and a wide one would silt up the
    // shallows with new land.
    return { x, z, y, r, rCut: r + Math.max(6, cut * 2.6), rFill: r + 1.6 };
  });
  // the ground everything is drawn on: the road-graded field with the village pads cut in,
  // each easing out to meet the hillside without a rim
  function height(x, z) {
    let y = roadHeight(x, z);
    for (const p of PADS) {
      const d = Math.hypot(x - p.x, z - p.z);
      const reach = p.y < y ? p.rCut : p.rFill;
      if (d < reach) y += (p.y - y) * (1 - sstep(p.r, reach, d));
    }
    return y;
  }
  // height() is five octaves of fbm on top of each other — something like eighty sines a
  // call. Walking a hundred villagers called it once per villager per frame, which on its
  // own is thirty million sines a second and was by far the most expensive thing on the
  // page. The terrain never changes, so it is baked once here and read back bilinearly;
  // the error is a few hundredths of a unit, under a blob some four units tall.
  const HGRID = 384, HSPAN = 360;
  const HTABLE = new Float32Array(HGRID * HGRID);
  for (let j = 0; j < HGRID; j++) {
    const z = (j / (HGRID - 1) - 0.5) * HSPAN;
    for (let i = 0; i < HGRID; i++) HTABLE[j * HGRID + i] = height((i / (HGRID - 1) - 0.5) * HSPAN, z);
  }
  function heightAt(x, z) {
    const fx = (x / HSPAN + 0.5) * (HGRID - 1), fz = (z / HSPAN + 0.5) * (HGRID - 1);
    if (!(fx >= 0 && fx <= HGRID - 1 && fz >= 0 && fz <= HGRID - 1)) return height(x, z);
    const i = fx | 0, j = fz | 0;
    const i1 = i + 1 < HGRID ? i + 1 : i, j1 = j + 1 < HGRID ? j + 1 : j;
    const tx = fx - i, tz = fz - j;
    const a = HTABLE[j * HGRID + i], b = HTABLE[j * HGRID + i1];
    const c = HTABLE[j1 * HGRID + i], d = HTABLE[j1 * HGRID + i1];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  }
  // the pad a destination stands on, or null where there is none: the docks builds its hut
  // out on the pier, and picking the merely nearest pad would fling its label across the bay
  const padFor = (cx, cz) => {
    let best = null, bd = 20;
    for (const p of PADS) {
      const d = Math.hypot(p.x - cx, p.z - cz);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };

  // waypoints from (x0,z0) to (x1,z1); lane (a signed distance across the ribbon) keeps each
  // blob in its own strip of the road, offset sideways at every waypoint rather than in one
  // fixed world direction, so it tracks the road through curves instead of cutting corners.
  function route(x0, z0, x1, z1, lane) {
    const path = [];
    if (Math.hypot(x1 - x0, z1 - z0) > 40) {
      const a = nearestRoad(x0, z0), b = nearestRoad(x1, z1), n = ROAD.length;
      const step = (b - a + n) % n <= n / 2 ? 1 : n - 1;         // the shorter way round
      for (let i = a; ; i = (i + step) % n) {
        const f = roadFrame(i);
        path.push([f.x + f.nx * lane, f.z + f.nz * lane]);
        if (i === b) break;
      }
    }
    path.push([x1, z1]);
    return path;
  }
  // what a villager looks like (face atlas, moods, bodies) lives in blob.js, shared with the
  // place card's lineup so both draw the same villager from the same id
  // a blob's own lane across the road, stable per agent, always inside the ribbon
  const laneFor = id => (rand(id, 3) * 2 - 1) * (ROAD_HALF_W - 0.6);
  // an agent's own standing spot for an area: the point on the road nearest that area, nudged
  // along the road (so a crowd queues rather than stacking) and across it into its own lane,
  // always on the road itself, never out on the grass around the area.
  // half the length of that queue: eight units did for dots; bodies need room, so it grows
  // with the village (set in apply()) up to a stretch of road that still reads as one place
  let queueHalf = 8;
  function spot(id, area) {
    const f = roadFrame(nearestRoad(area.x, area.z));
    const along = (rand(id, 1) * 2 - 1) * queueHalf;
    return [f.x + f.tx * along + f.nx * laneFor(id), f.z + f.tz * along + f.nz * laneFor(id)];
  }

  const TEMPLATE_CSS = `
    :host, island-3d { display:block; position:absolute; inset:0; }
    .i3d-canvas { position:absolute; inset:0; cursor:grab; }
    .i3d-canvas:active { cursor:grabbing; }
    .i3d-overlay { position:absolute; inset:0; pointer-events:none; overflow:hidden; transition:opacity .35s ease; }
    /* Hide UI: the place labels go with the rest of the furniture (IslandApp sets the attribute) */
    island-3d[hide-labels] .i3d-overlay { opacity:0; }
    island-3d[hide-labels] .i3d-pin { pointer-events:none !important; }
    /* A place label is set the way the rest of the page's furniture is: no box at all, just
       a small tracked uppercase name and a mono head-count in the page's own pale blues, held
       off the terrain by a soft shadow (as Hide UI and Start are), over a dot in the area's
       colour on the spot itself. It is placed with a transform alone, from the top-left
       corner, so the per-frame move never touches layout (see loop()). */
    .i3d-pin { position:absolute; left:0; top:0; transform-origin:50% 100%; display:flex; flex-direction:column; align-items:center; gap:4px;
      font-family:Nunito, system-ui, sans-serif; background:none; border:0; padding:0; margin:0; cursor:pointer;
      pointer-events:auto; opacity:0; transition:opacity .2s ease; will-change:transform; }
    .i3d-tag { display:flex; align-items:center; gap:6px; white-space:nowrap; }
    .i3d-name { font-size:11px; font-weight:900; letter-spacing:.13em; text-transform:uppercase;
      text-shadow:0 1px 2px rgba(0,0,0,1), 0 0 4px rgba(0,0,0,.85), 0 0 10px rgba(0,0,0,.7); }
    .i3d-count { font-family:'IBM Plex Mono', ui-monospace, monospace; font-size:11px; font-weight:500; line-height:1; color:#fff;
      font-variant-numeric:tabular-nums; padding:2px 5px; border-radius:3px; box-shadow:0 1px 3px rgba(0,0,0,.55);
      text-shadow:0 1px 1px rgba(0,0,0,.45); }
    .i3d-pin.compact .i3d-name { display:none; }
    .i3d-dot { width:7px; height:7px; border-radius:50%; box-shadow:0 0 0 1.5px rgba(242,243,244,.9), 0 1px 3px rgba(0,0,0,.6); }
    .i3d-pin:hover .i3d-name { filter:brightness(1.15); }
  `;

  class Island3D extends HTMLElement {
    connectedCallback() {
      if (this._booted) return;
      this._booted = true;
      const style = document.createElement("style");
      style.textContent = TEMPLATE_CSS;
      this.appendChild(style);
      this.canvasHost = document.createElement("div");
      this.canvasHost.className = "i3d-canvas";
      this.overlay = document.createElement("div");
      this.overlay.className = "i3d-overlay";
      this.appendChild(this.canvasHost);
      this.appendChild(this.overlay);
      // the pin rides over the building rather than over the area's nominal centre, which
      // can sit a dozen units inland of the pad the hut ended up on. Only the label moves:
      // spot() still routes blobs from AREAS, and the pad was cut at the road waypoint
      // nearest that same centre, so the crowd already gathers at the door.
      this.areas = AREAS.map(a => {
        const pad = padFor(a.x, a.z);
        return pad ? { ...a, x: pad.x, z: pad.z, y: pad.y + 5.6, count: 0, shown: -1 }   // the roof's peak: the leader's dot sits on it
          : { ...a, y: height(a.x, a.z) + 3, count: 0, shown: -1 };
      });
      this.areaById = new Map(this.areas.map(a => [a.id, a]));
      // agent id -> { id, x, z, job, dest, path, marketAt, marketUntil, mood, ...bodyOf(id) }
      // marketAt / marketUntil are that ONE villager's day at the market: they set off in
      // their own moment after the round settles and leave the moment their own next
      // decision lands. There is deliberately no global "everyone is at the market" flag
      // any more — that flag was what made the whole village turn in one lump.
      this.blobs = new Map();
      this.round = null;
      this.speed = 30;                  // walking speed, world units a second
      this.areas.forEach(a => {
        a.pin = document.createElement("button");
        a.pin.className = "i3d-pin";
        // The site's own colour carries the label: the name is set in a lightened tint of it
        // (the full colour is a mid-tone, and forest green on a green hillside disappears),
        // the head-count sits on a chip of the colour itself, and the dot on the roof matches.
        const tint = "#" + [1, 3, 5].map(i => Math.round(parseInt(a.color.slice(i, i + 2), 16) * 0.42 + 255 * 0.58).toString(16).padStart(2, "0")).join("");
        a.pin.innerHTML = `<span class="i3d-tag"><span class="i3d-name" style="color:${tint}">${a.name}</span>` +
          `<span class="i3d-count" style="background:${a.color}">0</span></span>` +
          `<span class="i3d-dot" style="background:${a.color}"></span>`;
        a.countEl = a.pin.querySelector(".i3d-count");
        a.pin.addEventListener("click", () => window.dispatchEvent(new CustomEvent("moku:location", { detail: a.id })));
        this.overlay.appendChild(a.pin);
      });
      // the tags are measured for decluttering; measure again once the real fonts are in
      document.fonts?.ready?.then(() => this.areas.forEach(a => { a.boxW = 0; }));
      this.boot();
    }
    disconnectedCallback() {
      this.disasters?.dispose();
      this._unsub?.();
      this._unsubActs?.();
      this._unsubUpdates?.();
      this._unsubRound?.();
      cancelAnimationFrame(this._raf);
      this.renderQuality?.dispose();
      if (this.renderer) this.renderer.dispose();
    }

    // The CCTV inset renders the same scene into a canvas that is then scaled to about a
    // seventh of its width, so at full device pixel ratio it was shading roughly fifty
    // times the pixels anybody could see. Half a CSS pixel is still oversampled for it.
    set lowPower(on) {
      on = !!on;
      if (on === this._lowPower) return;
      this._lowPower = on;
      if (this.renderer) { this.renderer.setPixelRatio(this.pixelRatio()); this.resize(); }
    }
    get lowPower() { return !!this._lowPower; }

    // A budget as well as a cap: at 1.8 on a large display the island was shading sixteen
    // million pixels a frame. Small windows are untouched; only very big ones come down.
    pixelRatio() {
      const dpr = window.devicePixelRatio || 1;
      if (this._lowPower) return Math.min(0.5, dpr);
      const px = Math.max(1, (this.clientWidth || 1) * (this.clientHeight || 1));
      return Math.min(1.8, dpr, Math.sqrt(2.1e6 / px));
    }

    async boot() {
      this.THREE = THREE;
      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(DAYLIGHT.horizon, 320, 950);
      this.scene = scene;

      const camera = new THREE.PerspectiveCamera(42, 1, 1, 6000);
      this.camera = camera;
      this.orbit = { r: 240, theta: 0.82, phi: 1.29, tr: 240, ttheta: 0.82, tphi: 1.29 };

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      // Keep the high-density surface that makes the water read as water rather than a
      // flat blue plane — but inside a pixel budget, and far below it while the scene is
      // only the CCTV thumbnail (pixelRatio() above).
      this.renderer = renderer;
      renderer.setPixelRatio(this.pixelRatio());
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.setClearColor(DAYLIGHT.horizon, 1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      this.canvasHost.appendChild(renderer.domElement);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";

      this.hemi = new THREE.HemisphereLight(NIGHT?0x8ba9e0:0xc5e5fa, NIGHT?0x4b5571:0xa9a07b, NIGHT?.95:.95);
      scene.add(this.hemi);
      const sun = new THREE.DirectionalLight(0xffe6bb, 2.35);
      sun.position.copy(SUN_DIRECTION).multiplyScalar(175);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.left = -112; sun.shadow.camera.right = 112;
      sun.shadow.camera.top = 112; sun.shadow.camera.bottom = -112;
      sun.shadow.camera.far = 420;
      sun.shadow.bias = -0.00015;
      sun.shadow.normalBias = 0.12;
      sun.shadow.radius = 2.5;
      scene.add(sun);
      this.sun = sun;
      this.daylight = addDaylight(scene);
      this.renderQuality = createRenderQuality(renderer, scene, camera);

      // ---- terrain ----
      const SIZE = 340, SEG = 330;
      const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      const colors = new Float32Array(pos.count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const y = height(x, z);
        pos.setY(i, y);
        const hx = height(x + 1.4, z), hz = height(x, z + 1.4);
        const slope = Math.min(1, (Math.abs(y - hx) + Math.abs(y - hz)) / 2.6);
        if (y < -3) c.set(0x2c7f92);
        else if (y < 1.3) c.set(0xeadcae);
        else if (y < 3) c.setHex(0xf2d49a).lerp(new THREE.Color(0x87c94a), (y - 1.3) / 1.7);
        else c.setHex(0x65ac31).lerp(new THREE.Color(0x8bc342), fbm(x * 0.06, z * 0.06, 2));
        if (slope > 0.45 && y > 2) c.lerp(new THREE.Color(0xa18a65), (slope - 0.45) * 1.5);
        c.multiplyScalar(0.97 + fbm(x * 0.3, z * 0.3, 2) * 0.06);
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      }
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      // The per-vertex palette above sets the broad bands; this shader adds the
      // per-pixel detail they cannot carry (sand grain, grass clumping and rock
      // strata), the same way the water surface is upscaled. No extra geometry.
      const landMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
      landMat.onBeforeCompile = shader => {
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vGround;')
          .replace('#include <begin_vertex>','#include <begin_vertex>\nvGround=position;');
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
          varying vec3 vGround;
          float grain(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
          float softNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
            return mix(mix(grain(i),grain(i+vec2(1,0)),f.x),mix(grain(i+vec2(0,1)),grain(i+vec2(1,1)),f.x),f.y);}`)
          .replace('#include <color_fragment>',`#include <color_fragment>
            float field=softNoise(vGround.xz*0.18);
            float fleck=softNoise(vGround.xz*5.0);
            float grass=smoothstep(2.0,5.5,vGround.y);
            diffuseColor.rgb*=0.93+field*0.12+(fleck-0.5)*0.045;
            diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(0.94,1.025,0.93),grass*field);`);
      };
      const land = new THREE.Mesh(geo, landMat);
      land.castShadow = true;
      land.receiveShadow = true;
      scene.add(land);

      // ---- vegetation: instanced low-poly palms on gentle mid slopes ----
      // Built from primitives rather than loaded as a model: 120 palms ride in two
      // draw calls this way, each with its own tint, and there is no asset to fetch.
      const mergeGeos = geos => {
        const parts = geos.map(g => g.index ? g.toNonIndexed() : g);
        const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
        const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
        let o = 0;
        for (const g of parts) {
          pos.set(g.attributes.position.array, o * 3);
          nor.set(g.attributes.normal.array, o * 3);
          o += g.attributes.position.count;
        }
        const out = new THREE.BufferGeometry();
        out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
        return out;
      };
      const TRUNK_H = 2.8;
      const treeGeo = mergeGeos([0, 1, 2].map(i => {
        const g = new THREE.ConeGeometry(3.4 - i * 0.65, 4.5, 7);
        g.translate(0, 4.2 + i * 2.2, 0);
        return g;
      }));
      const PALMS = 36;
      const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }), PALMS);
      trees.castShadow = true;
      trees.receiveShadow = true;
      // the trunk leans and thins as it climbs, the way a palm does
      const trunkGeo = new THREE.CylinderGeometry(0.14, 0.30, TRUNK_H, 6, 7);
      trunkGeo.translate(0, TRUNK_H / 2, 0);
      {
        const pos = trunkGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const t = pos.getY(i) / TRUNK_H;
          pos.setX(i, pos.getX(i) + t * t * 0.85);
        }
        trunkGeo.computeVertexNormals();
      }
      const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x6b4c33, roughness: 1, metalness: 0 }), PALMS);
      trunks.castShadow = true;
      trunks.receiveShadow = true;
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), tp = new THREE.Vector3();
      const tcol = new THREE.Color();
      let placed = 0;
      for (let i = 0; i < 60000 && placed < PALMS; i++) {
        const x = (hash2(i * 1.7, 3.1) - 0.5) * 210;
        const z = (hash2(i * 2.3, 9.7) - 0.5) * 210;
        const hgt = height(x, z);
        if (hgt < 5 || hgt > 21 || Math.hypot(x, z) < 68) continue;
        const sl = Math.abs(hgt - height(x + 1.5, z)) + Math.abs(hgt - height(x, z + 1.5));
        if (sl > 4.2) continue;
        if (hash2(i * 5.3, 1.9) > 0.055) continue;
        if (distToRoad(x, z) < ROAD_HALF_W + 4.5) continue; // clear of the road, fronds included
        const s = 0.78 + hash2(i * 0.9, 4.4) * 0.5;
        tp.set(x, hgt - 0.3, z);
        sc.set(s, s * (0.85 + hash2(i, 7) * 0.45), s);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash2(i, 2) * 6.28);
        m4.compose(tp, q, sc);
        trees.setMatrixAt(placed, m4);
        trunks.setMatrixAt(placed, m4);
        tcol.setHSL(0.29 + hash2(i, 11) * 0.035, 0.62, 0.28 + hash2(i, 17) * 0.12);
        trees.setColorAt(placed, tcol);
        placed++;
      }
      trees.count = placed;
      trunks.count = placed;
      trees.instanceMatrix.needsUpdate = true;
      trunks.instanceMatrix.needsUpdate = true;
      if (trees.instanceColor) trees.instanceColor.needsUpdate = true;
      scene.add(trees);
      scene.add(trunks);

      // ---- water: shader surface with waves, depth shading and shoreline foam ----
      const HMAP = 256;
      const hdata = new Uint8Array(HMAP * HMAP * 4);
      for (let j = 0; j < HMAP; j++) {
        for (let k = 0; k < HMAP; k++) {
          const wx = (k / (HMAP - 1) - 0.5) * SIZE;
          const wz = (j / (HMAP - 1) - 0.5) * SIZE;
          const hh = height(wx, wz);
          const v = Math.max(0, Math.min(255, Math.round((hh + 40) * 3.1)));  // -40..42 -> 0..255
          const o = (j * HMAP + k) * 4;
          hdata[o] = v; hdata[o + 1] = v; hdata[o + 2] = v; hdata[o + 3] = 255;
        }
      }
      const hTex = new THREE.DataTexture(hdata, HMAP, HMAP, THREE.RGBAFormat);
      hTex.minFilter = hTex.magFilter = THREE.LinearFilter;
      hTex.needsUpdate = true;

      const waterUniforms = {
        uTime: { value: 0 },
        uStorm: { value: 0 },
        uHeight: { value: hTex },
        uSize: { value: SIZE },
        uSun: { value: SUN_DIRECTION.clone() },
        uDeep: { value: new THREE.Color(NIGHT?0x143859:0x087f9f) },
        uMid: { value: new THREE.Color(NIGHT?0x24637d:0x20b3bd) },
        uShallow: { value: new THREE.Color(NIGHT?0x4a939e:0x71d4bc) },
        uFoam: { value: new THREE.Color(0xf2fbff) },
        uCam: { value: new THREE.Vector3() },
        // Ocean and sky share a pale atmospheric horizon in the same color space.
        uHorizon: { value: new THREE.Color(DAYLIGHT.sea) }
      };
      const waterMat = new THREE.ShaderMaterial({
        uniforms: waterUniforms,
        vertexShader: `
          uniform float uTime;
          uniform float uStorm;
          varying vec3 vWorld;
          varying vec2 vWave;
          void main() {
            vec3 p = position;
            float w1 = sin(p.x * 0.055 + uTime * 0.9) * cos(p.y * 0.041 - uTime * 0.7);
            float w2 = sin((p.x + p.y) * 0.031 - uTime * 1.3);
            float w3 = sin(p.y * 0.12 + uTime * 1.9) * 0.35;
            float disp = w1 * 0.2 + w2 * 0.12 + w3 * 0.06;
            p.z += disp * (1.0 + uStorm * 3.0);
            vWave = vec2(w1, w2);
            vec4 wp = modelMatrix * vec4(p, 1.0);
            vWorld = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: `
          uniform float uTime;
          uniform float uStorm;
          uniform float uSize;
          uniform sampler2D uHeight;
          uniform vec3 uSun, uCam, uDeep, uMid, uShallow, uFoam, uHorizon;
          varying vec3 vWorld;
          varying vec2 vWave;

          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p){
            vec2 i = floor(p), f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
                       mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
          }
          float fbm(vec2 p){
            float s = 0.0, a = 0.5;
            for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
            return s;
          }
          float terrainAt(vec2 xz){
            vec2 uv = xz / uSize + 0.5;
            if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return -40.0;
            return texture2D(uHeight, uv).r * 255.0 / 3.1 - 40.0;
          }
          void main() {
            vec2 xz = vWorld.xz;
            float r = length(xz);
            // Past the rim the sea is the backdrop's own colour and nothing else: no noise,
            // no lighting. Zoomed right out this is most of the water on screen, so the wide
            // shot costs less than it did, not more.
            // Continue through output conversion even beyond the water shelf.
            // The seabed is only known inside the terrain's square, and at that square's edge
            // it is not yet as deep as the open sea is taken to be, which drew the square on
            // the water. Ease the depth out to the open sea's before the edge is reached.
            float depth = mix(-terrainAt(xz), 40.0, smoothstep(uSize * 0.26, uSize * 0.495, r));   // metres of water
            float shore = smoothstep(0.0, 16.0, depth);
            // a long ramp: the lagoon's blue thins into the open sea over the whole shelf, reaching
            // the deep colour only where the depth does (40), so there is no ring to find an edge on
            float mid = smoothstep(6.0, 40.0, depth);
            mid = mid * mid * (3.0 - 2.0 * mid);
            vec3 col = mix(mix(uShallow, uMid, shore), uDeep, mid);

            // Two scrolling fractal fields give the old water its fine choppy
            // highlights and keep the foam from reading as a uniform ring.
            float n1 = fbm(xz * 0.19 + vec2(uTime * 0.16, uTime * 0.11));
            float n2 = fbm(xz * 0.46 - vec2(uTime * 0.23, uTime * 0.19));
            float e = 0.55;
            float hxa = fbm((xz + vec2(e, 0.0)) * 0.19 + vec2(uTime * 0.16, uTime * 0.11));
            float hza = fbm((xz + vec2(0.0, e)) * 0.19 + vec2(uTime * 0.16, uTime * 0.11));
            vec3 nrm = normalize(vec3((n1 - hxa) * (1.6 + uStorm * 3.0), 1.0, (n1 - hza) * (1.6 + uStorm * 3.0)));

            // lighting: diffuse tint + sharp sun glint + fresnel sky
            vec3 viewDir = normalize(uCam - vWorld);
            vec3 halfv = normalize(uSun + viewDir);
            float spec = pow(max(dot(nrm, halfv), 0.0), 110.0) * 0.21;
            float sparkle = pow(max(dot(nrm, halfv), 0.0), 32.0) * 0.025 * (0.4 + n2);
            float fres = pow(1.0 - max(dot(nrm, viewDir), 0.0), 3.0);
            col += vec3(0.035, 0.06, 0.06) * (n1 - 0.5);
            col = mix(col, vec3(0.40, 0.67, 0.85), fres * 0.28);
            col += vec3(1.0, 0.97, 0.88) * (spec + sparkle);

            // shoreline foam: band over shallow ground, broken up by noise and swell
            float band = 1.0 - smoothstep(0.0, 2.8, depth);
            float swell = 0.5 + 0.5 * sin(depth * 2.1 - uTime * 2.2 + n1 * 5.0);
            float foam = band * smoothstep(0.35, 0.85, swell * (0.55 + 0.7 * fbm(xz * 0.7 + uTime * 0.08)));
            foam += (1.0 - smoothstep(0.0, 0.7, depth)) * 0.55;
            col = mix(col, uFoam, clamp(foam * 0.8, 0.0, 0.68));

            // …and the lit, choppy sea fades into that flat colour on the way out to the rim
            col = mix(col, uHorizon, smoothstep(180.0, 520.0, r));

            float alpha = clamp(0.62 + shore * 0.38 + foam * 0.4, 0.0, 1.0);
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
        transparent: false,
        depthWrite: true
      });
      const water = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000, 150, 150), waterMat);
      water.rotation.x = -Math.PI / 2;
      water.position.y = SEA;
      water.receiveShadow = false;
      scene.add(water);
      this.water = water;
      this.waterUniforms = waterUniforms;

      // ---- villagers: Primer blobs ----
      // One pear of a body, instanced: every villager is the same lathe under its own matrix
      // (height, girth and lean from its id), so the whole village is one draw call. The face
      // is a patch of that same lathe, a hair proud of the skin, sharing the body's matrices
      // and picking its cell of a canvas-drawn atlas — mood across, the villager's own
      // features down. Hats and the like are modelled in the body's space too, so they take
      // the body's matrix as it is. The meshes themselves are built in syncBlobs().
      {
        // the body, the face patch, the face atlas and the hats are blob.js's (blobParts), so
        // the place card's lineup renders the very same model
        const parts = blobParts();
        this.blobGeo = parts.bodyGeo;
        this.blobMat = plushMaterial();
        this.eyeGeo = parts.eyeGeo;
        this.furGeo = parts.furGeo;this.specsGeo = parts.specsGeo;
        this.jobGeo = parts.jobGeo;
        this.badgeGeo = parts.badgeGeo;
        this.faceGeo = parts.faceGeo;

        const atlas = new THREE.CanvasTexture(parts.atlas);
        atlas.colorSpace = THREE.SRGBColorSpace;
        atlas.anisotropy = 4;
        this.faceMat = new THREE.MeshBasicMaterial({ map: atlas, alphaTest: 0.3, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
        this.faceMat.onBeforeCompile = (sh) => {
          sh.vertexShader = "attribute vec2 aFace;\n" + sh.vertexShader.replace("#include <uv_vertex>",
            `#include <uv_vertex>\n\tvMapUv = (vMapUv + aFace) * vec2(${(1 / FACE_COLS).toFixed(6)}, ${(1 / FACE_LOOKS).toFixed(6)});`);
        };

        const std = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0 });
        this.extras = parts.extras.map(e => ({ mat: std(e.color), geo: e.geo }));
      }
      // one linear colour per area, worked out once: `new Color().set("#1f9fb5")` per blob
      // per frame was a hundred string parses and sRGB conversions a frame for nothing
      this.areaRGB = new Map(AREAS.map(a => { const col = new THREE.Color(a.color); return [a.id, [col.r, col.g, col.b]]; }));

      // All pre-existing buildings and the harbor share the new town kit.
      this.town = addStrategyVillage(scene, height, AREAS.map(a => {
        const pad = padFor(a.x, a.z);
        return { ...a, x: pad?.x ?? a.x, z: pad?.z ?? a.z };
      }));
      for (const a of this.areas) {
        const landmark = this.town.landmarks[a.id];
        if (landmark) Object.assign(a, landmark);
      }

      this._frame = 0;
      this.bindInput();
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(this);
      this.resize();
      this.loop();
      // the road: a sandy ribbon laid on the ground along the waypoints. Each slice samples
      // several points across the width, not just the two edges. On a slope the terrain
      // between two edge samples can bulge up above the straight line joining them, which is
      // what pokes the mountain through a wide, coarsely-sliced ribbon.
      {
        const pts = [];
        ROAD.forEach(([x, z], i) => {
          const [nx, nz] = ROAD[(i + 1) % ROAD.length], steps = Math.ceil(Math.hypot(nx - x, nz - z) / 2.4);
          for (let k = 0; k < steps; k++) pts.push([x + (nx - x) * k / steps, z + (nz - z) * k / steps]);
        });
        // SPAN is wider than following the ground needs: the spare vertices are what carry the
        // worn-pale centre and gritty shoulders, which two edge samples per slice cannot hold.
        const n = pts.length, SPAN = 9;      // cross-section samples per slice, edge to edge
        // the worn strip wanders instead of running dead centre, and stones gather in stretches
        // rather than evenly. Both are read off the compass bearing so they close at the seam.
        const alongNoise = (x, z, f, sx, sy) => {
          const a = Math.atan2(z, x);
          return vnoise(Math.cos(a) * f + sx, Math.sin(a) * f + sy);
        };
        const verts = [], index = [], rcol = [];
        const worn = new THREE.Color(0xefe2bd), grit = new THREE.Color(0xa1957c), pale = new THREE.Color(0xc2bdb1);
        const rc = new THREE.Color();
        const frames = pts.map(([x, z], i) => {
          const [ax, az] = pts[(i + n - 1) % n], [bx, bz] = pts[(i + 1) % n];
          const len = Math.hypot(bx - ax, bz - az) || 1;
          return {
            x, z, px: -(bz - az) / len, pz: (bx - ax) / len,
            wander: (alongNoise(x, z, 3.1, 5, 2) * 2 - 1) * 0.45,
            clump: alongNoise(x, z, 8.4, 13, 7),
          };
        });
        const rings = frames.map(f => {
          const ring = [];
          for (let s = 0; s < SPAN; s++) {
            const across = s / (SPAN - 1) * 2 - 1;
            const vx = f.x + f.px * across * ROAD_HALF_W, vz = f.z + f.pz * across * ROAD_HALF_W;
            ring.push([vx, height(vx, vz) + 0.4, vz]);
            const g = fbm(vx * 0.55 + 3, vz * 0.55 + 8, 3);
            const wear = smooth(1 - Math.min(1, Math.abs(across - f.wander) / 0.95));
            rc.copy(grit).lerp(worn, Math.min(1, wear * (0.55 + g * 0.5)));
            rc.lerp(pale, Math.max(0, g - 0.52) * 1.25);                   // bare stone showing through
            rc.multiplyScalar(Math.min(1.12, 0.9 + fbm(vx * 1.7 + 21, vz * 1.7 + 13, 2) * 0.24));
            rcol.push(rc.r, rc.g, rc.b);
          }
          return ring;
        });
        rings.forEach(ring => ring.forEach(([vx, vy, vz]) => verts.push(vx, vy, vz)));
        for (let i = 0; i < n; i++) {
          const ni = (i + 1) % n;
          for (let s = 0; s < SPAN - 1; s++) {
            const a = i * SPAN + s, b = a + 1, c = ni * SPAN + s, d = c + 1;
            index.push(a, b, c, b, d, c);
          }
        }
        const roadGeo = new THREE.BufferGeometry();
        roadGeo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
        roadGeo.setAttribute("color", new THREE.Float32BufferAttribute(rcol, 3));
        roadGeo.setIndex(index);
        roadGeo.computeVertexNormals();
        // The vertex tones above set the broad wear pattern; this adds what they are far too
        // coarse to hold, grit at sand scale and a pebble-sized mottle, the same upscaling
        // trick the land uses. Nothing to fetch and no extra triangles.
        const roadMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
        roadMat.onBeforeCompile = (sh) => {
          sh.vertexShader = sh.vertexShader
            .replace("#include <common>", "#include <common>\nvarying vec3 vRPos;")
            .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\n  vRPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
          sh.fragmentShader = sh.fragmentShader
            .replace("#include <common>", `#include <common>
              varying vec3 vRPos;
              float rRough = 1.0;
              float rh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
              float rvn(vec2 p){
                vec2 i = floor(p), f = fract(p);
                vec2 u = f * f * (3.0 - 2.0 * f);
                return mix(mix(rh(i), rh(i + vec2(1,0)), u.x), mix(rh(i + vec2(0,1)), rh(i + vec2(1,1)), u.x), u.y);
              }
              float rfb(vec2 p, int oct){
                float s = 0.0, a = 0.5;
                for (int i = 0; i < 5; i++) { if (i >= oct) break; s += a * rvn(p); p *= 2.07; a *= 0.5; }
                return s;
              }
              // cell noise sized to a pebble: the fill breaks into stones with dark gaps
              // between them instead of dithering into uniform speckle
              float rcell(vec2 p){
                vec2 ip = floor(p), fp = fract(p);
                float d = 1.0;
                for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
                  vec2 g = vec2(float(x), float(y));
                  vec2 o = vec2(rh(ip + g), rh(ip + g + 7.3));
                  d = min(d, length(g + o - fp));
                }
                return d;
              }`)
            .replace("#include <color_fragment>", `#include <color_fragment>
              {
                vec2 wp = vRPos.xz;
                float grit = rfb(wp * 11.0, 3);
                float top = 1.0 - smoothstep(0.04, 0.30, rcell(wp * 2.6));     // a pebble's crown
                float bed = 1.0 - rcell(wp * 0.8);                             // drifts of loose stone
                float stony = clamp(0.25 + bed * 1.1, 0.0, 1.0);               // bare stretches between them
                top *= stony;
                diffuseColor.rgb += vec3(0.055, 0.05, 0.038) * (grit - 0.5) * 2.0;
                diffuseColor.rgb *= 0.88 + top * 0.2;
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.71, 0.67), top * 0.36);
                diffuseColor.rgb = clamp(diffuseColor.rgb, 0.0, 1.0);
                // trodden stone takes a sheen, the loose grit around it does not
                rRough = clamp(1.0 - top * 0.36 - (grit - 0.5) * 0.16, 0.45, 1.0);
              }`)
            .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n  roughnessFactor = rRough;");
        };
        const road = new THREE.Mesh(roadGeo, roadMat);
        road.receiveShadow = true;
        scene.add(road);

        // real stones set into the path, so it reads as a footpath and not a painted strip.
        // Clustered along the same worn centre line the vertex colours follow, with a few
        // strays out to the shoulders, and sunk in rather than dropped on top. One draw call,
        // and small enough that a blob reads as walking over them, not round them.
        const pebGeo = new THREE.IcosahedronGeometry(0.5, 0);
        const MAX_PEB = 420;
        const pebbles = new THREE.InstancedMesh(pebGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.66, flatShading: true }), MAX_PEB);
        const pcol = new THREE.Color(), eu = new THREE.Euler();
        let pebPlaced = 0;
        for (let i = 0; i < 2600 && pebPlaced < MAX_PEB; i++) {
          const f = frames[Math.floor(hash2(i * 0.731, 12.4) * n) % n];
          if (hash2(i * 1.37, 5.9) > 0.012 + f.clump * f.clump * 0.44) continue;   // stony stretches, bare stretches
          const r = hash2(i * 2.17, 31.3) * 2 - 1;
          // cubed and measured off the wandering centre rather than the ribbon's, so the trail
          // winds with the worn strip and only the odd stray reaches a shoulder
          const across = f.wander + r * r * r * (0.93 - Math.abs(f.wander));
          const x = f.x + f.px * across * ROAD_HALF_W, z = f.z + f.pz * across * ROAD_HALF_W;
          const top = height(x, z) + 0.4;
          if (top < SEA + 0.6) continue;                  // never a stone standing in the water
          const s = 0.2 + hash2(i * 3.91, 8.2) * 0.34;
          const ys = 0.5 + hash2(i * 4.53, 19.7) * 0.32;  // squashed: worn flat, not tumbled
          tp.set(x, top - 0.2 * s * ys, z);
          sc.set(s * (0.85 + hash2(i, 51) * 0.4), s * ys, s * (0.85 + hash2(i, 53) * 0.4));
          eu.set(hash2(i, 55) * 6.28, hash2(i, 57) * 6.28, hash2(i, 59) * 6.28);
          q.setFromEuler(eu);
          m4.compose(tp, q, sc);
          pebbles.setMatrixAt(pebPlaced, m4);
          pcol.setHSL(0.09 + hash2(i, 63) * 0.05, 0.04 + hash2(i, 65) * 0.07, 0.44 + hash2(i, 61) * 0.26);
          pebbles.setColorAt(pebPlaced, pcol);
          pebPlaced++;
        }
        pebbles.count = pebPlaced;
        pebbles.instanceMatrix.needsUpdate = true;
        if (pebbles.instanceColor) pebbles.instanceColor.needsUpdate = true;
        pebbles.receiveShadow = true;
        scene.add(pebbles);
      }

      // The shared store polls /state and holds the one EventSource; a settled round reaches
      // us the moment it lands, and the scene keeps its last picture if the server goes away.
      this.disasters = createDisasterEffects({scene, height, areas: this.areas, sun: this.sun, hemi: this.hemi, water: waterUniforms, land});
      this._unsub = subscribe(s => this.apply(s));
      // …and every villager's own answer reaches us the moment THAT villager answers.
      this._unsubActs = subscribeActs(act => this.onAct(act));
      // Later news about a villager who has already acted (their shift arriving after their
      // first order, say) still moves that one villager — and only that one.
      this._unsubUpdates = subscribeUpdates(act => this.onAct(act));
      this._unsubRound = subscribeRound(e => this.settle(e.round, e.roundMs ?? e.ms));
    }

    /** /state: the truth, for first load, reconnection and drift — never a starting gun. */
    apply(s) {
      if (!s) return;
      if (this.runId !== s.runId) { this.blobs.clear(); this.round = null; this.runId=s.runId; this.syncBlobs(); } // server down: keep the last picture
      this.completed = !!s.completed;
      if (!s.running && !s.completed) { this.blobs.clear(); this.round = null; this.syncBlobs(); return; }
      setPopulation(s.agents?.length);
      queueHalf = Math.min(24, Math.max(8, (s.agents?.length || 0) * 0.5));
      const n = this.blobs.size;
      for (const a of s.agents) {
        let b = this.blobs.get(a.id);
        if (!b) {
          const job = areaOf(a.activity) || MARKET, [x, z] = spot(a.id, job);
          this.blobs.set(a.id, b = { id: a.id, x, z, job, dest: job, path: [], marketAt: 0, marketUntil: 0, mood: HAPPY, ...bodyOf(a.id) });
        }
        b.mood = moodOf(a);
        // A villager whose own news we already hold — shown or still waiting for its slot
        // — is left alone. Without this the poll lands in the middle of a staggered burst
        // and sets the whole village at once: the very lump the stagger is breaking up.
        if (!owns(a.id)) b.job = areaOf(a.activity) || b.job;
      }
      if (this.blobs.size !== n) this.syncBlobs();
      this.settle(s.round, s.roundMs);                   // deduped against the SSE round event
    }

    /** A round settled. Everyone drifts to the market — each in their own moment. */
    settle(round, roundMs) {
      if (typeof round !== 'number') return;
      if (this.round === null) { this.round = round; return; }   // first snapshot: no market trip
      if (round === this.round) return;
      this.round = round;
      const now = performance.now();
      const quick = !(roundMs >= 3000);                  // too short to fit the trip in
      const stay = Math.min(9000, Math.max(3000, (roundMs || 0) * 0.45));
      this.speed = quick ? 60 : Math.max(30, 200 / (stay / 1000 * 0.6));
      for (const b of this.blobs.values()) {
        if (quick) { b.marketAt = 0; b.marketUntil = 0; continue; }
        b.marketAt = now + rand(b.id, 9) * 900;          // sets off in their own moment
        // …and leaves the moment their own answer lands. The fallback, for a villager whose
        // answer never comes, is staggered too, so a village of stragglers still trickles.
        b.marketUntil = now + stay + rand(b.id, 10) * 700;
      }
    }

    /** One villager's own decision has landed: this is the only thing that moves them. */
    onAct(act) {
      const b = this.blobs.get(act.id);
      if (!b) return;
      const area = areaOf(act.task);
      if (area) b.job = area;
      b.marketAt = 0; b.marketUntil = 0;                 // their day at the market is over
    }

    bindInput() {
      const el = this.renderer.domElement;
      let dragging = false, px = 0, py = 0, downX=0, downY=0, traveled=0;
      el.addEventListener("pointerdown", (e) => { dragging = true; downX=e.clientX; downY=e.clientY; traveled=0; this._cameraTouched = true; px = e.clientX; py = e.clientY; el.setPointerCapture(e.pointerId); });
      el.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        traveled=Math.max(traveled,Math.hypot(e.clientX-downX,e.clientY-downY));
        const o = this.orbit;
        o.ttheta += (e.clientX - px) * 0.006;
        o.tphi = Math.min(1.42, Math.max(0.16, o.tphi + (e.clientY - py) * 0.005));
        px = e.clientX; py = e.clientY;
      });
      const stop = () => { dragging = false; };
      el.addEventListener("pointerup", e => {
        const click=dragging&&traveled<6&&Math.hypot(e.clientX-downX,e.clientY-downY)<6;
        stop();if(!click||!this.body)return;
        const rect=el.getBoundingClientRect(),pointer=new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
        const ray=new THREE.Raycaster();ray.setFromCamera(pointer,this.camera);
        this.body.updateMatrixWorld(true);
        this.body.computeBoundingSphere();
        const hit=ray.intersectObject(this.body,false)[0];
        if(hit?.instanceId!=null){const id=[...this.blobs.keys()][hit.instanceId];window.dispatchEvent(new CustomEvent('moku:agent',{detail:id}));}
      });
      el.addEventListener("pointercancel", stop);
      el.addEventListener("wheel", (e) => {
        e.preventDefault();
        this._cameraTouched = true;
        const o = this.orbit;
        o.tr = Math.min(400, Math.max(48, o.tr * (1 + Math.sign(e.deltaY) * 0.09)));
      }, { passive: false });
    }

    resize() {
      if (!this.renderer || !this.camera) return;
      const w = this.clientWidth || 1, h = this.clientHeight || 1;
      const want = this.pixelRatio();
      if (Math.abs(this.renderer.getPixelRatio() - want) > 0.01) this.renderer.setPixelRatio(want);
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      if (!this._cameraTouched) this.orbit.r = this.orbit.tr = Math.min(400, 240 * Math.max(1, h / w));
      this.camera.updateProjectionMatrix();
      this.renderQuality?.resize(w, h, this.renderer.getPixelRatio());
    }

    // One instance per blob, rebuilt when the village changes size; the matrices, colours
    // and faces are written every frame in walk(). The face mesh reads the body's matrices.
    syncBlobs() {
      if (!this.blobGeo) return;
      const THREE = this.THREE, n = this.blobs.size;
      for (const m of this.blobMeshes || []) { this.scene.remove(m); m.dispose(); }
      this.face?.geometry.dispose();
      this.blobMeshes = [];
      this.body = this.face = null;
      if (!n) return;
      const add = (geo, mat, count) => {
        const m = new THREE.InstancedMesh(geo, mat, count);
        m.frustumCulled = false;
        this.scene.add(m); this.blobMeshes.push(m);
        return m;
      };
      this.body = add(this.blobGeo, this.blobMat, n);
      this.body.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      this.body.castShadow = this.body.receiveShadow = true;
      this.eyes = add(this.eyeGeo,new THREE.MeshStandardMaterial({color:0x101014,roughness:.38}),n);
      this.fur=add(this.furGeo,new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false}),n);
      this.fur.instanceMatrix=this.body.instanceMatrix;this.fur.instanceColor=this.body.instanceColor;
      this.specs=add(this.specsGeo,new THREE.MeshStandardMaterial({color:0x18171b,roughness:.65}),n);
      this.jobBadge = add(this.jobGeo, this.blobMat, n);
      this.jobBadge.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n*3),3);
      this.jobBadge.instanceMatrix = this.body.instanceMatrix;
      const badgeRim=add(this.badgeGeo,this.blobMat,n);
      badgeRim.instanceMatrix=this.body.instanceMatrix;
      this.face = add(this.faceGeo.clone(), this.faceMat, n);
      this.face.instanceMatrix = this.body.instanceMatrix;
      this.face.geometry.setAttribute("aFace", new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2));
      const counts = this.extras.map(() => 0);
      for (const b of this.blobs.values()) if (b.extra >= 0) b.extraAt = counts[b.extra]++;
      this.extraMeshes = this.extras.map((e, k) => counts[k] ? add(e.geo, e.mat, counts[k]) : null);
    }

    // Walk every blob toward where it should be. Where that is, is that blob's own
    // business: their own market window, then their own job the moment their own decision
    // lands. Nothing here is shared between villagers any more except the clock.
    walk(dt, now) {
      if (!this.body || this.body.count !== this.blobs.size) return;
      const THREE = this.THREE;
      const mats = this.body.instanceMatrix.array, col = this.body.instanceColor.array;
      const faces = this.face.geometry.attributes.aFace;
      const M = this._bm || (this._bm = { m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(0, 0, 0, "YXZ"), p: new THREE.Vector3(), s: new THREE.Vector3() });
      const cam = this.camera.position;
      // zoomed right out a villager is a few pixels: let them grow with the distance, so the
      // village stays readable from the far orbit and is life-size once you come down to it
      const zoom = BLOB * Math.min(1.8, Math.max(1, this.orbit.r / 150));
      let faceDirty = false;
      // Nobody stands in anybody: overlapping pairs ease apart. A village
      // tops out at 137, so every pair every frame is nine thousand cheap tests.
      const all = this._all || (this._all = []);
      all.length = 0;
      for (const b of this.blobs.values()) all.push(b);
      const ease = Math.min(1, dt * 6) * 0.5;
      for (let p = 0; p < all.length; p++) for (let q = p + 1; q < all.length; q++) {
        const A = all[p], B = all[q], dx = B.x - A.x, dz = B.z - A.z;
        const min = (A.girth + B.girth) * BLOB * 0.56;
        if (Math.abs(dx) >= min || Math.abs(dz) >= min) continue;
        const d = Math.hypot(dx, dz);
        if (d >= min) continue;
        const ang = d > 1e-3 ? 0 : (A.id * 2.4 + B.id), ux = d > 1e-3 ? dx / d : Math.cos(ang), uz = d > 1e-3 ? dz / d : Math.sin(ang);
        // someone walking through steps round someone standing, not the other way about
        const wa = !A.path.length === !B.path.length ? 1 : A.path.length ? 2 : 0, push = (min - d) * ease;
        A.x -= ux * push * wa; A.z -= uz * push * wa; B.x += ux * push * (2 - wa); B.z += uz * push * (2 - wa);
      }
      const areas = this.areas;
      for (let k = 0; k < areas.length; k++) areas[k].count = 0;
      let i = 0, crowd = 0;
      for (const b of this.blobs.values()) {
        const held = now >= b.marketAt && now < b.marketUntil;
        if (held) crowd++;
        const dest = held ? MARKET : b.job;
        if (dest !== b.dest) {
          b.dest = dest;
          b.path = route(b.x, b.z, ...spot(b.id, dest), laneFor(b.id));
        }
        const ox = b.x, oz = b.z;
        let left = this.speed * dt;
        while (b.path.length && left > 0) {
          const [tx, tz] = b.path[0], d = Math.hypot(tx - b.x, tz - b.z);
          if (d <= left) { b.x = tx; b.z = tz; left -= d; b.path.shift(); }
          else { b.x += (tx - b.x) / d * left; b.z += (tz - b.z) / d * left; left = 0; }
        }
        const working = !b.path.length && dest !== MARKET;
        const hop = (working ? Math.abs(Math.sin(now * 0.006 + b.id)) : 0);
        // They look where they are going; standing, they turn to whoever is watching,
        // each a little to one side of it, so a crowd is not a firing squad.
        const moved = Math.hypot(b.x - ox, b.z - oz) > 1e-4;
        const want = moved ? Math.atan2(b.x - ox, b.z - oz) : Math.atan2(cam.x - b.x, cam.z - b.z) + b.aside;
        if (b.yaw === undefined) b.yaw = want;
        b.yaw += Math.atan2(Math.sin(want - b.yaw), Math.cos(want - b.yaw)) * Math.min(1, dt * 7);
        // a waddle on the road, a squash and stretch through the hop at work, breathing otherwise
        const step = moved ? Math.sin(now * 0.014 + b.phase) : 0;
        const tall = working ? 0.9 + 0.17 * hop : moved ? 1 : 1 + 0.025 * Math.sin(now * 0.003 + b.phase);
        const wide = working ? 1.06 - 0.09 * hop : 1;
        M.e.set(b.leanX, b.yaw, b.leanZ + step * 0.07);
        M.p.set(b.x, Math.max(0.8, heightAt(b.x, b.z)) - 0.06 + hop * 1.2 + Math.abs(step) * 0.22, b.z);
        M.s.set(zoom * b.girth * wide, zoom * b.tall * tall, zoom * b.girth * wide);
        M.m.compose(M.p, M.q.setFromEuler(M.e), M.s).toArray(mats, i * 16);
        if (b.extra >= 0) M.m.toArray(this.extraMeshes[b.extra].instanceMatrix.array, b.extraAt * 16);
        const jobRGB=this.areaRGB.get(b.job.id);
        this.jobBadge.instanceColor.array.set(jobRGB,i*3);
        const rgb = b.rgb; // Stable personality color; the small badge follows the current job.
        col[i * 3] = rgb[0]; col[i * 3 + 1] = rgb[1]; col[i * 3 + 2] = rgb[2];
        const blink=(now * 0.001 + b.phase) % b.blinkEvery < 0.13;
        const eyeLocal=this._eyeLocal||(this._eyeLocal=new THREE.Matrix4());
        eyeLocal.makeScale(1,blink?.07:1,1);eyeLocal.setPosition(0,.76,0);
        const eyeWorld=this._eyeWorld||(this._eyeWorld=new THREE.Matrix4());
        eyeWorld.multiplyMatrices(M.m,eyeLocal).toArray(this.eyes.instanceMatrix.array,i*16);
        if(b.look===2)M.m.toArray(this.specs.instanceMatrix.array,i*16);
        else {eyeLocal.makeScale(0,0,0);eyeWorld.multiplyMatrices(M.m,eyeLocal).toArray(this.specs.instanceMatrix.array,i*16);}
        const cell = b.mood * 2 + (blink?1:0);
        if (faces.array[i * 2] !== cell) { faces.array[i * 2] = cell; faceDirty = true; }
        faces.array[i * 2 + 1] = FACE_LOOKS - 1 - b.look;
        if (!b.path.length) this.areaById.get(dest.id).count++;
        i++;
      }
      this.body.instanceMatrix.needsUpdate = this.body.instanceColor.needsUpdate = true;
      this.jobBadge.instanceColor.needsUpdate = true;
      this.eyes.instanceMatrix.needsUpdate = true;
      this.specs.instanceMatrix.needsUpdate = true;
      for (const m of this.extraMeshes) if (m) m.instanceMatrix.needsUpdate = true;
      if (faceDirty || !this._facesSent) faces.needsUpdate = this._facesSent = true;
      for (let k = 0; k < areas.length; k++) {
        const l = areas[k];
        if (l.shown !== l.count) { l.shown = l.count; l.countEl.textContent = l.count; l.boxW = 0; }
      }

      // Dusk follows the crowd rather than a flag: it draws in as the market fills and
      // lifts as the villagers trickle back out to their shifts, one by one.
      const dark = this.blobs.size ? crowd / this.blobs.size : 0;
      this.dusk = (this.dusk || 0) + (dark - (this.dusk || 0)) * Math.min(1, dt * 1.5);
      this.sun.color.set(0xfff1cf);
      this.sun.intensity = 2.35 - 0.1 * this.dusk;
      this.hemi.intensity = 0.95;
    }

    loop() {
      this._raf = requestAnimationFrame(this._tick || (this._tick = () => this.loop()));
      // Nothing to draw into, or nobody looking: skip the whole frame. (Browsers already
      // throttle rAF on a hidden tab, but not every host does, and a zero-sized canvas
      // still costs a full render.)
      if (document.hidden || !this.clientWidth || !this.clientHeight) { this._last = 0; return; }
      // Inset in the corner of the admin panel, the scene is a security camera: ~8 fps is
      // plenty, and the rest of the frames are given back to the dashboard.
      if (this._lowPower) {
        const t = performance.now();
        if (t - (this._lpAt || 0) < 120) return;
        this._lpAt = t;
      }
      this._frame = (this._frame || 0) + 1;
      if (this._frame === 3) { this.renderer.shadowMap.autoUpdate = false; this.renderer.shadowMap.needsUpdate = true; }
      const o = this.orbit;
      o.r += (o.tr - o.r) * 0.09;
      o.theta += (o.ttheta - o.theta) * 0.12;
      o.phi += (o.tphi - o.phi) * 0.12;
      const w0 = this.clientWidth || 1, h0 = this.clientHeight || 1;
      if (w0 !== this._w || h0 !== this._h) { this._w = w0; this._h = h0; this.resize(); }
      const cy = Math.cos(o.phi) * o.r;
      const cr = Math.sin(o.phi) * o.r;
      // What the camera looks at, and so what a zoom closes in on. It used to be the island's
      // centre — a point inside the mountain, so the view ray met the ground high on the near
      // slope and zooming in ended in a hillside. Zoomed out it is still the centre (a touch
      // lower, to sit the island in the frame); as the camera comes in, the focus slides out
      // toward the shore on the camera's own side and down to the road, so a zoom lands on
      // the village below you and orbiting at close range sweeps round the coast.
      const zk = Math.min(1, Math.max(0, (190 - o.r) / (190 - 48)));
      const ze = zk * zk * (3 - 2 * zk);
      const fr = FOCUS_R * ze, fx = Math.cos(o.theta) * fr, fz = Math.sin(o.theta) * fr, fy = 3 + 1.5 * ze;
      this.camera.position.set(fx + Math.cos(o.theta) * cr, Math.max(14, cy), fz + Math.sin(o.theta) * cr);
      this.camera.lookAt(fx, fy, fz);
      this.camera.updateMatrixWorld(true);

      const now = performance.now();
      this.walk(this.completed ? 0 : Math.min(0.1, (now - (this._last || now)) / 1000), now);
      this._last = now;

      // Area labels follow their spot on the island. The work is split in two by cost.
      // EVERY frame: project the anchor with this frame's camera and move the label with a
      // transform — no layout, no style recalc beyond the one property, so the label is glued
      // to the ground it points at however fast the island is dragged. (It used to be placed
      // every third frame with left/top, so at 60 Hz it trailed the terrain by up to two
      // frames of camera motion, which is what read as lag.)
      // EVERY THIRD frame: the slow questions, whose answers change slowly — is it behind
      // the mountain along the view ray, and does it overlap a nearer label.
      {
        const w = this.clientWidth, h = this.clientHeight;
        const v = this._pinVector || (this._pinVector = new this.THREE.Vector3());
        const cam = this.camera.position;
        const slow = this._frame % 3 === 0 || !this._pinsPlaced;
        const areas = this.areas;
        for (let k = 0; k < areas.length; k++) {
          const l = areas[k];
          v.set(l.x, l.y, l.z).project(this.camera);
          l.sx = (v.x * 0.5 + 0.5) * w; l.sy = (-v.y * 0.5 + 0.5) * h;
          l.off = v.z > 1 || l.sx < -20 || l.sx > w + 20 || l.sy < -10 || l.sy > h + 30;
          if (!slow) continue;
          l.dist = Math.hypot(cam.x - l.x, cam.y - l.y, cam.z - l.z);
          l.occluded = false;
          if (!l.off) {                                   // terrain occlusion along the view ray
            for (let t = 0.12; t < 0.94; t += 0.06) {
              const px = cam.x + (l.x - cam.x) * t;
              const py = cam.y + (l.y - cam.y) * t;
              const pz = cam.z + (l.z - cam.z) * t;
              if (heightAt(px, pz) > py + 1.2) { l.occluded = true; break; }
            }
          }
        }

        if (slow) {
          this._pinsPlaced = true;
          const placedBoxes = [];
          const order = this._pinOrder || (this._pinOrder = areas.slice());
          order.sort((a, b) => a.dist - b.dist);
          for (const l of order) {
            // measured, not guessed: the tag is as wide as its name and its count. Only a
            // changed count invalidates it, and a transform never dirties layout, so this
            // read is free on every other pass.
            if (!l.boxW) {
              const was = l.pin.classList.contains("compact");
              l.pin.classList.remove("compact");
              l.boxW = l.pin.offsetWidth; l.boxH = l.pin.offsetHeight;
              l.pin.classList.add("compact");
              l.smallW = l.pin.offsetWidth;
              l.pin.classList.toggle("compact", was);
            }
            let show = !l.off && !l.occluded, compact = false;
            if (show) {
              const hits = bw => {
                const box = { x0: l.sx - bw / 2 - 3, x1: l.sx + bw / 2 + 3, y0: l.sy - l.boxH - 3, y1: l.sy + 3 };
                return { box, clash: placedBoxes.some(b => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0) };
              };
              const full = hits(l.boxW);
              if (full.clash) {
                const small = hits(l.smallW);               // keep the marker, drop the name
                if (small.clash) show = false; else { compact = true; placedBoxes.push(small.box); }
              } else placedBoxes.push(full.box);
            }
            if (show !== l.vis) {
              l.vis = show;
              l.pin.style.opacity = show ? 1 : 0;
              l.pin.style.pointerEvents = show ? "auto" : "none";
            }
            if (compact !== l.compact) { l.compact = compact; l.pin.classList.toggle("compact", compact); }
            const z = 1000 - Math.round(l.dist);
            if (z !== l.z0) { l.z0 = z; l.pin.style.zIndex = String(z); }
          }
        }

        for (let k = 0; k < areas.length; k++) {
          const l = areas[k];
          if (!l.vis || l.off) continue;
          // whole pixels: the text stays crisp, and a label at rest does not shimmer
          const tx = Math.round(l.sx), ty = Math.round(l.sy);
          if (tx === l.tx && ty === l.ty) continue;
          l.tx = tx; l.ty = ty;
          l.pin.style.transform = `translate3d(${tx}px,${ty}px,0) translate(-50%,-100%)`;
        }
      }

      if (this.waterUniforms) {
        this.waterUniforms.uTime.value = performance.now() * 0.001;
        this.waterUniforms.uCam.value.copy(this.camera.position);
      }
      this.daylight?.update(now * 0.001, this.disasters?.weather);
      this.town?.update(now * 0.001);
      this.disasters?.update(now * 0.001, this._lowPower, (NIGHT?1.65:2.35) - .1 * (this.dusk || 0));
      if (this._lowPower) this.renderer.render(this.scene, this.camera);
      else this.renderQuality.render();
    }
  }

  if (!customElements.get("island-3d")) customElements.define("island-3d", Island3D);
})();
