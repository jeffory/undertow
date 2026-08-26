// QA ANNOTATE — in-game point-and-comment capture (qa-issues.md T8).
//
// The visual-feedback tools in this space (Agentation, Vynix, doop) all resolve
// a click to a DOM node and hand the agent a CSS selector. Undertow is a single
// <canvas>, so every one of them degrades to "the user clicked #app". This is
// the same idea resolved against the SCENE and the SIM instead of the DOM.
//
// What a click yields that a selector cannot:
//   - the world-space point under the cursor (scene raycast, not the y=0 plane)
//   - water height vs ground height there, and the signed gap between them
//     (the exact numeric shape of the B1 "water over islands" class of bug)
//   - the mesh's ancestor-name chain AND its material colour as hex — the render
//     modules define named colour constants (SLATE_DARK = 0x1c2226, …), so the
//     hex greps straight back to the owning source file
//   - seed + simSteps tick + camera pose. Undertow is a fixed-timestep, seeded,
//     deterministic sim, so this is a REPRODUCIBLE FRAME, not just a screenshot:
//     a worker can replay to the exact tick to see the bug and to verify the fix.
//
// Debug-gated (?qa, or ?debug). Never runs on the production path.
//
// Flow: Q freezes the sim → click a spot → type → Enter. The note is POSTed to
// the Vite dev middleware (see vite.config.ts) which writes qa-notes/NNN.md and
// NNN.png for the orchestrator, and is copied to the clipboard as a fallback.

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { currentRenderContext } from '../render/renderer';
import { compositeScene } from '../render/post';
import { waterHeightAt } from '../core/waves';
import { groundYAt } from '../render/lake';
import { phaseAt } from '../game/clock';

// --- module state -------------------------------------------------------------

let world: WorldState | null = null;
let active = false;
let rootEl: HTMLDivElement | null = null;
let hintEl: HTMLDivElement | null = null;
let composerEl: HTMLDivElement | null = null;
let noteSeq = 0;

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();

// The sim is frozen while annotating so the click resolves against the frame the
// reviewer is actually looking at. main.ts reads this each frame.
export function isQaPaused(): boolean {
  return active;
}

export function qaEnabled(): boolean {
  if (typeof location === 'undefined') return false;
  return /[?&]qa/.test(location.search) || /[?&]debug/.test(location.search);
}

// --- captured context ---------------------------------------------------------

interface QaHit {
  world: { x: number; y: number; z: number } | null;
  objectPath: string;
  objectType: string;
  materialHex: string | null;
  materialType: string | null;
  triangles: number | null;
  distance: number | null;
}

interface QaNote {
  id: number;
  screenX: number;
  screenY: number;
  hit: QaHit;
  waterY: number | null;
  groundY: number | null;
  gap: number | null;
  text: string;
}

// Walk up the ancestor chain building a readable path. Unnamed nodes fall back
// to their type, so the shape of the graph still reads even when nothing is
// explicitly named by the render module.
function objectPath(obj: THREE.Object3D): string {
  const parts: string[] = [];
  let cur: THREE.Object3D | null = obj;
  while (cur && cur.type !== 'Scene') {
    parts.unshift(cur.name || cur.type);
    cur = cur.parent;
  }
  return parts.join(' > ') || '(scene root)';
}

// The greppable half: render modules declare palettes as named hex constants, so
// reporting the material colour points at the source line that drew this pixel.
function materialHex(obj: THREE.Object3D): string | null {
  const mesh = obj as THREE.Mesh;
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (!mat) return null;
  const c = (mat as unknown as { color?: THREE.Color }).color;
  if (!c) return null;
  return '0x' + c.getHexString();
}

function materialType(obj: THREE.Object3D): string | null {
  const mesh = obj as THREE.Mesh;
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (!mat) return null;
  return mat.name ? `${mat.type} "${mat.name}"` : mat.type;
}

function triangleCount(obj: THREE.Object3D): number | null {
  const geo = (obj as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
  if (!geo) return null;
  if (geo.index) return geo.index.count / 3;
  const pos = geo.getAttribute('position');
  return pos ? pos.count / 3 : null;
}

function raycastScene(clientX: number, clientY: number): QaHit {
  const ctx = currentRenderContext();
  const empty: QaHit = {
    world: null,
    objectPath: '(no renderer)',
    objectType: '-',
    materialHex: null,
    materialType: null,
    triangles: null,
    distance: null,
  };
  if (!ctx) return empty;

  const el = ctx.renderer.domElement;
  const w = el.clientWidth || 1;
  const h = el.clientHeight || 1;
  ndc.set((clientX / w) * 2 - 1, -(clientY / h) * 2 + 1);
  ray.setFromCamera(ndc, ctx.camera);

  // Visible meshes only — skip the sky dome's BackSide shell and anything the
  // reviewer cannot actually see, which would otherwise swallow every click.
  const hits = ray
    .intersectObjects(ctx.scene.children, true)
    .filter((h) => h.object.visible && h.object.type !== 'Points' && h.object.type !== 'Line');

  const first = hits.find((h) => !/sky|dome|background/i.test(objectPath(h.object)));
  if (!first) {
    // Fall back to the y=0 water plane so a click on open water still lands.
    const dir = ray.ray.direction;
    if (Math.abs(dir.y) < 1e-6) return empty;
    const t = -ray.ray.origin.y / dir.y;
    if (t < 0) return empty;
    return {
      ...empty,
      objectPath: '(no mesh — y=0 plane fallback)',
      world: {
        x: ray.ray.origin.x + dir.x * t,
        y: 0,
        z: ray.ray.origin.z + dir.z * t,
      },
      distance: t,
    };
  }

  return {
    world: { x: first.point.x, y: first.point.y, z: first.point.z },
    objectPath: objectPath(first.object),
    objectType: first.object.type,
    materialHex: materialHex(first.object),
    materialType: materialType(first.object),
    triangles: triangleCount(first.object),
    distance: first.distance,
  };
}

// --- markdown ------------------------------------------------------------------

function n(v: number | null | undefined, digits = 2): string {
  return v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(digits);
}

function renderMarkdown(note: QaNote): string {
  const w = world!;
  const ctx = currentRenderContext();
  const cam = ctx?.camera;
  const p = note.hit.world;
  const phase = phaseAt(w.time.elapsed * 1000);

  const lines: string[] = [];
  lines.push(`## QA note ${String(note.id).padStart(3, '0')}`);
  lines.push('');
  lines.push(`> ${note.text}`);
  lines.push('');
  lines.push('### Reproduce');
  lines.push('```');
  lines.push(`?seed=${w.seed}&debug&qa   → replay to tick ${w.time.simSteps}`);
  lines.push(`seed        ${w.seed}`);
  lines.push(`tick        ${w.time.simSteps}  (elapsed ${n(w.time.elapsed)}s)`);
  lines.push(`phase       ${phase}`);
  lines.push(`mode        ${w.mode}${w.dockedIslet !== null ? ` (docked islet ${w.dockedIslet})` : ''}`);
  lines.push(`dread       ${n(w.dread, 1)}`);
  if (cam) {
    lines.push(
      `camera      pos (${n(cam.position.x)}, ${n(cam.position.y)}, ${n(cam.position.z)})  fov ${cam.fov}`,
    );
  }
  lines.push('```');
  lines.push('');
  lines.push('### Under the cursor');
  lines.push('```');
  lines.push(`screen      (${note.screenX}, ${note.screenY})`);
  if (p) lines.push(`world       (${n(p.x)}, ${n(p.y)}, ${n(p.z)})`);
  lines.push(`object      ${note.hit.objectPath}`);
  if (note.hit.materialType) lines.push(`material    ${note.hit.materialType}`);
  if (note.hit.materialHex) {
    lines.push(`colour      ${note.hit.materialHex}   ← grep this hex for the owning palette constant`);
  }
  if (note.hit.triangles !== null) lines.push(`triangles   ${note.hit.triangles}`);
  if (note.hit.distance !== null) lines.push(`distance    ${n(note.hit.distance)}m from camera`);
  lines.push('');
  lines.push(`water y     ${n(note.waterY)}   (waterHeightAt, core/waves.ts)`);
  lines.push(`ground y    ${n(note.groundY)}   (groundYAt, render/lake.ts)`);
  if (note.gap !== null) {
    const verdict =
      note.gap > 0
        ? `water is ${n(note.gap)}m ABOVE ground here — submerged/overflowing`
        : `ground is ${n(-note.gap)}m above water here — dry`;
    lines.push(`gap         ${n(note.gap)}   → ${verdict}`);
  }
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

// --- capture + submit -----------------------------------------------------------

// toDataURL only sees a live drawing buffer, and the renderer is created without
// preserveDrawingBuffer. Re-render synchronously in this same task so the buffer
// is populated when we read it — no renderer construction change needed.
function grabFrame(): string | null {
  const ctx = currentRenderContext();
  if (!ctx) return null;
  try {
    compositeScene(ctx);
    return ctx.renderer.domElement.toDataURL('image/png');
  } catch {
    return null;
  }
}

async function submit(note: QaNote): Promise<void> {
  const md = renderMarkdown(note);
  const png = grabFrame();

  // Clipboard first — always works, even with no dev server behind us.
  try {
    await navigator.clipboard.writeText(md);
  } catch {
    /* clipboard blocked (no focus / no permission) — the POST below still runs */
  }

  try {
    const res = await fetch('/__qa/note', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: note.id, markdown: md, png }),
    });
    if (res.ok) {
      const j = (await res.json()) as { path?: string };
      flash(`saved → ${j.path ?? 'qa-notes/'}  (also copied to clipboard)`);
      return;
    }
    flash('copied to clipboard (dev server did not accept the write)');
  } catch {
    flash('copied to clipboard (no dev server)');
  }
}

// --- DOM ------------------------------------------------------------------------

function flash(msg: string): void {
  if (!hintEl) return;
  hintEl.textContent = msg;
  window.setTimeout(() => {
    if (hintEl && active) hintEl.textContent = HINT;
  }, 2600);
}

const HINT = 'QA ANNOTATE — sim frozen · click a spot to pin · Q to resume';

function ensureDom(): void {
  if (rootEl) return;

  const style = document.createElement('style');
  style.textContent = `
    #qa-annotate { position: fixed; inset: 0; z-index: 9000; display: none;
      cursor: crosshair; }
    #qa-annotate.on { display: block; }
    #qa-hint { position: fixed; top: 0; left: 0; right: 0; z-index: 9001;
      font: 11px/1.9 monospace; text-align: center; color: #0a1418;
      background: #e0b062; letter-spacing: 0.04em; pointer-events: none; }
    .qa-pin { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px;
      border-radius: 50%; border: 2px solid #e0b062; background: rgba(224,176,98,0.25);
      box-shadow: 0 0 0 1px #0a1418; pointer-events: none; }
    .qa-pin.done { border-color: #22c55e; background: rgba(34,197,94,0.25); }
    #qa-composer { position: absolute; z-index: 9002; width: 320px;
      background: #0c1418; border: 1px solid #2a3a44; padding: 8px;
      font: 11px/1.5 monospace; color: #cfe0d8; box-shadow: 0 6px 24px #000a; }
    #qa-composer textarea { width: 100%; height: 62px; resize: vertical;
      background: #060c0f; color: #dfe9dc; border: 1px solid #22303a;
      font: 11px/1.5 monospace; padding: 4px; box-sizing: border-box; }
    #qa-composer .qa-ctx { color: #7f9aa8; margin-bottom: 6px; white-space: pre-wrap;
      max-height: 92px; overflow: auto; }
    #qa-composer .qa-keys { color: #5e7583; margin-top: 5px; }
  `;
  document.head.appendChild(style);

  rootEl = document.createElement('div');
  rootEl.id = 'qa-annotate';
  rootEl.addEventListener('mousedown', onPick, true);
  document.body.appendChild(rootEl);

  hintEl = document.createElement('div');
  hintEl.id = 'qa-hint';
  hintEl.style.display = 'none';
  document.body.appendChild(hintEl);
}

function closeComposer(): void {
  composerEl?.remove();
  composerEl = null;
}

function onPick(e: MouseEvent): void {
  if (!active || !world) return;
  e.preventDefault();
  e.stopPropagation();
  if (composerEl) closeComposer();

  const hit = raycastScene(e.clientX, e.clientY);
  const p = hit.world;
  const waterY = p ? waterHeightAt(p.x, p.z, world.time.elapsed) : null;
  const groundY = p ? groundYAt(world, p.x, p.z) : null;
  const gap = waterY !== null && groundY !== null ? waterY - groundY : null;

  const note: QaNote = {
    id: ++noteSeq,
    screenX: Math.round(e.clientX),
    screenY: Math.round(e.clientY),
    hit,
    waterY,
    groundY,
    gap,
    text: '',
  };

  const pin = document.createElement('div');
  pin.className = 'qa-pin';
  pin.style.left = `${e.clientX}px`;
  pin.style.top = `${e.clientY}px`;
  rootEl!.appendChild(pin);

  // Composer, nudged back inside the viewport near the right/bottom edges.
  const c = document.createElement('div');
  c.id = 'qa-composer';
  c.style.left = `${Math.min(e.clientX + 14, window.innerWidth - 340)}px`;
  c.style.top = `${Math.min(e.clientY + 14, window.innerHeight - 190)}px`;

  const ctxLine = document.createElement('div');
  ctxLine.className = 'qa-ctx';
  ctxLine.textContent = [
    p ? `world (${n(p.x)}, ${n(p.y)}, ${n(p.z)})` : 'world —',
    hit.objectPath,
    hit.materialHex ? `colour ${hit.materialHex}` : hit.materialType,
    gap !== null ? `water−ground ${n(gap)}m` : null,
    `seed ${world.seed} · tick ${world.time.simSteps}`,
  ]
    .filter(Boolean)
    .join('\n');

  const ta = document.createElement('textarea');
  ta.placeholder = "what's wrong here?";

  const keys = document.createElement('div');
  keys.className = 'qa-keys';
  keys.textContent = 'Enter save · Shift+Enter newline · Esc discard';

  c.append(ctxLine, ta, keys);
  document.body.appendChild(c);
  composerEl = c;
  ta.focus();

  ta.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Escape') {
      pin.remove();
      noteSeq--;
      closeComposer();
      return;
    }
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      const text = ta.value.trim();
      if (!text) return;
      note.text = text;
      pin.className = 'qa-pin done';
      pin.title = text;
      closeComposer();
      void submit(note);
    }
  });
}

function setActive(on: boolean): void {
  active = on;
  ensureDom();
  rootEl!.classList.toggle('on', on);
  hintEl!.style.display = on ? 'block' : 'none';
  hintEl!.textContent = HINT;
  if (!on) {
    closeComposer();
    // Keep the sim from swallowing the frozen wall-clock as catch-up steps.
    if (world) world.time.lastReal = performance.now();
  }
}

export function initQaAnnotate(w: WorldState): void {
  if (!qaEnabled()) return;
  world = w;
  ensureDom();
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.code !== 'KeyQ') return;
      // don't hijack Q while typing a note
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return;
      e.preventDefault();
      e.stopPropagation();
      setActive(!active);
    },
    true,
  );
}
