import { CellKind, cellIndex, type ArenaData } from '../procedural/ArenaTypes';
import type { ThemePalette } from '../procedural/Themes';
import type { NavGrid } from '../world/NavGrid';

export interface MinimapBlip {
  x: number;
  z: number;
  /** Archetype id; ranged enemies draw cyan to match their eyes. */
  kind?: string;
}

/**
 * Circular rotating minimap. The arena layout is pre-rendered once to an offscreen canvas; each
 * frame only blits it rotated around the player and draws enemy / pickup blips.
 */
export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private layout: HTMLCanvasElement = document.createElement('canvas');
  private data: ArenaData | null = null;
  private readonly px = 4; // layout pixels per cell
  /** World metres visible from centre to edge. */
  private radiusMeters = 18;
  debug = false;

  constructor(sizeCss: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = this.canvas.height = Math.round(sizeCss * dpr);
    this.canvas.style.width = this.canvas.style.height = `${sizeCss}px`;
    this.ctx = this.canvas.getContext('2d')!;
  }

  setArena(data: ArenaData, theme: ThemePalette): void {
    this.data = data;
    const n = data.size;
    const px = this.px;
    this.layout.width = this.layout.height = n * px;
    const g = this.layout.getContext('2d')!;
    g.clearRect(0, 0, n * px, n * px);
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        const i = cellIndex(n, x, z);
        const h = data.heights[i]!;
        const k = data.kinds[i]!;
        let color: string;
        // Subtle radar styling: open floor stays transparent, structures are faint outlines.
        if (k === CellKind.Boundary) color = 'rgba(140,175,225,0.35)';
        else if (h === 0) continue;
        else if (k === CellKind.Platform || k === CellKind.Stair) color = mix(theme.accent, 0.22);
        else if (h <= 1.5) color = 'rgba(140,170,215,0.16)';
        else color = 'rgba(160,190,235,0.3)';
        g.fillStyle = color;
        // Canvas y grows downward; world +z is "north", so flip z.
        g.fillRect(x * px, (n - 1 - z) * px, px, px);
      }
    }
  }

  draw(px: number, pz: number, yaw: number, enemies: readonly MinimapBlip[], pickups: readonly (MinimapBlip & { kind: string })[], spawns?: readonly MinimapBlip[], nav?: NavGrid): void {
    const data = this.data;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const R = W / 2;
    ctx.clearRect(0, 0, W, W);
    if (!data) return;
    const scale = R / this.radiusMeters; // canvas px per metre
    const n = data.size;

    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, Math.PI * 2);
    ctx.clip();
    const bg = ctx.createRadialGradient(R, R, 0, R, R, R);
    bg.addColorStop(0, 'rgba(38,58,98,0.92)');
    bg.addColorStop(1, 'rgba(14,26,50,0.92)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, W);
    // Range rings.
    ctx.strokeStyle = 'rgba(140,180,240,0.12)';
    ctx.lineWidth = Math.max(1, W / 160);
    for (const f of [0.36, 0.7]) {
      ctx.beginPath();
      ctx.arc(R, R, R * f, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Rotate so the player's facing direction points up.
    ctx.translate(R, R);
    ctx.rotate(-yaw);
    const toCanvas = (wx: number, wz: number): [number, number] => [(wx - px) * scale, -(wz - pz) * scale];
    ctx.imageSmoothingEnabled = false;
    const [ox, oy] = toCanvas(0, n);
    ctx.drawImage(this.layout, ox, oy, n * scale, n * scale);

    if (this.debug && nav) {
      // Flow-field heat map (debug mode).
      for (let z = 1; z < n - 1; z++) {
        for (let x = 1; x < n - 1; x++) {
          const d = nav.dist[z * n + x]!;
          if (!Number.isFinite(d)) continue;
          const [cx, cy] = toCanvas(x, z + 1);
          ctx.fillStyle = `hsla(${Math.max(0, 200 - d * 6)},90%,55%,0.35)`;
          ctx.fillRect(cx, cy, scale, scale);
        }
      }
    }
    if (spawns) {
      ctx.fillStyle = '#b46bff';
      for (const s of spawns) {
        const [cx, cy] = toCanvas(s.x + 0.5, s.z + 0.5);
        ctx.fillRect(cx - 3, cy - 3, 6, 6);
      }
    }
    for (const p of pickups) {
      const [cx, cy] = toCanvas(p.x, p.z);
      ctx.fillStyle = p.kind === 'health' ? '#5dff8a' : '#ffd23a';
      ctx.fillRect(cx - 3, cy - 3, 6, 6);
    }
    ctx.fillStyle = '#ff3b3b';
    ctx.shadowColor = 'rgba(255,40,40,0.9)';
    ctx.shadowBlur = W * 0.04;
    for (const e of enemies) {
      let [cx, cy] = toCanvas(e.x, e.z);
      const d = Math.hypot(cx, cy);
      const max = R - 6;
      // Clamp off-map enemies to the rim so threats are always readable.
      if (d > max) {
        cx = (cx / d) * max;
        cy = (cy / d) * max;
      }
      const ranged = e.kind === 'shooter';
      ctx.fillStyle = ranged ? '#3fd8ff' : '#ff3b3b';
      ctx.shadowColor = ranged ? 'rgba(60,210,255,0.9)' : 'rgba(255,40,40,0.9)';
      ctx.beginPath();
      ctx.arc(cx, cy, W * 0.03, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.restore();

    // Player arrow (always pointing up).
    ctx.save();
    ctx.translate(R, R);
    ctx.fillStyle = '#ffc928';
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = Math.max(1.5, W / 110);
    const a = W * 0.065;
    ctx.beginPath();
    ctx.moveTo(0, -a);
    ctx.lineTo(a * 0.85, a * 0.7);
    ctx.lineTo(-a * 0.85, a * 0.7);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }
}

function mix(hex: string, alpha: number): string {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${alpha})`;
}
