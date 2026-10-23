import { MODULE_INFO, type SkinPalette, type WeaponDefinition } from '../combat/WeaponTypes';

/** Side-view silhouette of the procedural weapon, drawn from its actual parts and skin. */
export function drawWeaponIcon(canvas: HTMLCanvasElement, def: WeaponDefinition, skin: SkinPalette, mono?: string): void {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const parts = [...def.parts, ...def.magazine];
  let minZ = Infinity;
  let maxZ = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of parts) {
    minZ = Math.min(minZ, p.c[2] - p.s[2] / 2);
    maxZ = Math.max(maxZ, p.c[2] + p.s[2] / 2);
    minY = Math.min(minY, p.c[1] - p.s[1] / 2);
    maxY = Math.max(maxY, p.c[1] + p.s[1] / 2);
  }
  const pad = 4;
  const scale = Math.min((canvas.width - pad * 2) / (maxZ - minZ), (canvas.height - pad * 2) / (maxY - minY));
  const offX = (canvas.width - (maxZ - minZ) * scale) / 2;
  const offY = (canvas.height - (maxY - minY) * scale) / 2;
  // Draw largest parts first so details sit on top.
  const sorted = parts.slice().sort((a, b) => b.s[0] * b.s[1] * b.s[2] - a.s[0] * a.s[1] * a.s[2]);
  for (const p of sorted) {
    ctx.fillStyle = mono ?? (p.slot === 'module' ? (def.module ? MODULE_INFO[def.module].color : skin.emissive) : skin[p.slot]);
    const x = offX + (p.c[2] - p.s[2] / 2 - minZ) * scale;
    const y = offY + (maxY - (p.c[1] + p.s[1] / 2)) * scale;
    ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(p.s[2] * scale)), Math.max(1, Math.round(p.s[1] * scale)));
  }
}
