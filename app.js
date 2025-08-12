// app.js — Φ Sphere Packing Lab (WebGL)
// - Hinged links: moving a linked sphere keeps surface contact to neighbors
// - Adjacent-only snapping: only link spheres whose φ exponents differ by exactly 1

import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";

// ---------- constants/util ----------
const PHI = (1 + Math.sqrt(5)) / 2;
const EXPS = [1,-1,-2,-3,-4,-5,-6,-7,-8,-9]; // 10 sizes (φ^1..φ^-9)
const COLORS = Array.from({length:EXPS.length},(_,i)=>new THREE.Color().setHSL((i/EXPS.length), 1.0, 0.6));
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const colorForExp = e => COLORS[Math.max(0,EXPS.indexOf(e))];
const radiusForExp = (e, base=0.6)=> base*Math.pow(PHI, e);

const wrap = document.getElementById("viewport");
const diag = (msg) => { document.getElementById("diag").textContent = msg || ""; };
const setSnapLabel = v => { document.getElementById("snapv").textContent = v.toFixed(2); };

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setSize(wrap.clientWidth, wrap.clientHeight, false);
wrap.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = null;

const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 200);
camera.position.set(0, 2.4, 6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const hemi = new THREE.HemisphereLight(0xffffff, 0x404040, 0.9);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 1.0);
dir.position.set(4, 7, 6);
scene.add(dir);

const grid = new THREE.GridHelper(100, 100, 0x444444, 0x222222);
scene.add(grid);

// ---------- state ----------
const state = {
  nodes: [],    // { id, pos:THREE.Vector3, r, exp, color:THREE.Color }
  links: [],    // { aId, bId }
  magnet: true,
  snapTol: 0.06,
  nextId: 1
};
const spheres = new Map();  // id -> THREE.Mesh
const cylinders = [];       // link meshes

const findNode = id => state.nodes.find(n=>n.id===id);
const neighborsOf = id => {
  const ids = [];
  for (const l of state.links) {
    if (l.aId === id) ids.push(l.bId);
    else if (l.bId === id) ids.push(l.aId);
  }
  return ids.map(findNode).filter(Boolean);
};

// ---------- UI ----------
function populateExp() {
  const sel = document.getElementById("exp");
  EXPS.forEach(e => {
    const o = document.createElement("option");
    o.value = String(e);
    o.textContent = `φ^${e}`;
    sel.appendChild(o);
  });
}
populateExp();

document.getElementById("magnet").onchange = e => { state.magnet = e.target.checked; };
document.getElementById("snap").oninput = e => { state.snapTol = parseFloat(e.target.value); setSnapLabel(state.snapTol); };
setSnapLabel(state.snapTol);

document.getElementById("add").onclick = () => {
  const exp = parseFloat(document.getElementById("exp").value);
  addSphere(exp);
  syncFromState();
};
document.getElementById("addSet").onclick = () => { addPhiSet(); syncFromState(); };
document.getElementById("clear").onclick = () => { state.nodes.length = 0; state.links.length = 0; syncFromState(); };

// ---------- helpers ----------
function addSphere(exp, pos=null) {
  const n = {
    id: state.nextId++,
    exp,
    r: radiusForExp(exp),
    color: colorForExp(exp),
    pos: pos ? pos.clone() : new THREE.Vector3((Math.random()-0.5)*2, radiusForExp(exp), (Math.random()-0.5)*2)
  };
  state.nodes.push(n);
  return n;
}

function addPhiSet() {
  let x = -3;
  for (const e of EXPS) {
    const n = addSphere(e, new THREE.Vector3(x, radiusForExp(e), 0));
    x += n.r*2 + 0.12;
  }
}

function clearLinksMeshes() {
  for (const m of cylinders) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
  cylinders.length = 0;
}

function rebuildLinksMeshes() {
  clearLinksMeshes();
  const up = new THREE.Vector3(0,1,0);
  for (const l of state.links) {
    const A = findNode(l.aId), B = findNode(l.bId);
    if (!A || !B) continue;
    const av = A.pos, bv = B.pos;
    const dir = new THREE.Vector3().subVectors(bv, av);
    const len = dir.length();
    if (len < 1e-9) continue;
    dir.normalize();
    const axis = new THREE.Vector3().crossVectors(up, dir).normalize();
    const angle = Math.acos(clamp(up.dot(dir), -1, 1));
    const quat = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    const radius = Math.min(0.05, 0.3 * Math.min(A.r, B.r));
    const geom = new THREE.CylinderGeometry(radius, radius, len, 16);
    const mat = new THREE.MeshStandardMaterial({ color: 0xcfd9ff, roughness: 0.7, metalness: 0.0 });
    const m = new THREE.Mesh(geom, mat);
    m.quaternion.copy(quat);
    m.position.copy(av).addScaledVector(dir, len/2);
    scene.add(m);
    cylinders.push(m);
  }
}

function syncFromState() {
  // spheres
  for (const n of state.nodes) {
    let mesh = spheres.get(n.id);
    if (!mesh) {
      const geom = new THREE.SphereGeometry(n.r, 32, 16);
      const mat = new THREE.MeshStandardMaterial({ color: n.color, roughness: 0.35, metalness: 0.05 });
      mesh = new THREE.Mesh(geom, mat);
      mesh.userData.id = n.id;
      scene.add(mesh);
      spheres.set(n.id, mesh);
    }
    mesh.position.copy(n.pos);
    mesh.material.color = n.color;
    const cr = mesh.geometry.parameters?.radius ?? n.r;
    if (Math.abs(cr - n.r) > 1e-6) {
      mesh.geometry.dispose();
      mesh.geometry = new THREE.SphereGeometry(n.r, 32, 16);
    }
  }
  // remove deleted
  for (const [id, mesh] of spheres) {
    if (!state.nodes.some(n=>n.id===id)) {
      scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); spheres.delete(id);
    }
  }
  // links
  rebuildLinksMeshes();
}

// ---------- hinge constraint ----------
function applyHinges(id) {
  const n = findNode(id); if (!n) return;
  const neigh = neighborsOf(id);
  if (!neigh.length) return;

  // average of individual contact projections to all neighbors (simple multi-hinge)
  const acc = new THREE.Vector3();
  for (const m of neigh) {
    const rSum = n.r + m.r;
    const dir = new THREE.Vector3().subVectors(n.pos, m.pos);
    const len = dir.length();
    if (len < 1e-9) dir.set(1,0,0);
    else dir.multiplyScalar(1/len);
    acc.add(new THREE.Vector3().copy(m.pos).addScaledVector(dir, rSum));
  }
  acc.multiplyScalar(1/neigh.length);
  n.pos.copy(acc);
}

// ---------- magnet snap (adjacent-only) ----------
function tryMagnetSnap(id) {
  if (!state.magnet) return;
  const n = findNode(id); if (!n) return;

  const nIdx = EXPS.indexOf(n.exp);
  let best = null, bestErr = Infinity;
  for (const m of state.nodes) {
    if (m.id === n.id) continue;
    if (Math.abs(EXPS.indexOf(m.exp) - nIdx) !== 1) continue; // adjacent-only rule

    const target = n.r + m.r;
    const d = n.pos.distanceTo(m.pos);
    const err = Math.abs(d - target);
    const tol = state.snapTol * Math.max(n.r, m.r);
    if (err <= tol && err < bestErr) { bestErr = err; best = m; }
  }
  if (!best) return;

  // snap to exact surface
  const rSum = n.r + best.r;
  const dir = new THREE.Vector3().subVectors(n.pos, best.pos);
  const len = dir.length();
  if (len < 1e-9) dir.set(1,0,0); else dir.multiplyScalar(1/len);
  n.pos.copy(best.pos).addScaledVector(dir, rSum);

  // link if new
  if (!state.links.some(l=>(l.aId===n.id && l.bId===best.id) || (l.aId===best.id && l.bId===n.id))) {
    state.links.push({ aId: n.id, bId: best.id });
  }
  syncFromState();
}

// ---------- interactions (ray + drag on camera-facing plane) ----------
const ray = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let dragging = null;

renderer.domElement.addEventListener("pointerdown", (e) => {
  const r = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  mouse.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
  ray.setFromCamera(mouse, camera);
  const hits = ray.intersectObjects([...spheres.values()]);
  if (hits.length) {
    dragging = hits[0].object.userData.id;
    renderer.domElement.setPointerCapture(e.pointerId);
    // disable orbit while dragging sphere
    controls.enabled = false;
  }
});

renderer.domElement.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const normal = new THREE.Vector3().subVectors(camera.position, new THREE.Vector3(0,0,0)).normalize();
  const plane = new THREE.Plane(normal, 0);
  const r = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  mouse.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
  ray.setFromCamera(mouse, camera);
  const hit = new THREE.Vector3();
  ray.ray.intersectPlane(plane, hit);
  const n = findNode(dragging);
  n.pos.copy(hit);
  applyHinges(dragging);  // keep contact to neighbors while moving
  syncFromState();
});

renderer.domElement.addEventListener("pointerup", (e) => {
  if (!dragging) return;
  const id = dragging; dragging = null;
  tryMagnetSnap(id);
  syncFromState();
  renderer.domElement.releasePointerCapture(e.pointerId);
  controls.enabled = true;
});

// ---------- resize & animate ----------
function resize() {
  const w = Math.max(2, wrap.clientWidth);
  const h = Math.max(2, wrap.clientHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(wrap);

function tick() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

// ---------- seed + ready ----------
addPhiSet();
syncFromState();
diag("Drag spheres to move; release to snap. Only adjacent φ exponents will connect.");
