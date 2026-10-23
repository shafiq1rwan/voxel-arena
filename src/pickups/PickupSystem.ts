import type { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh';
import '@babylonjs/core/Meshes/instancedMesh';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { AudioManager } from '../audio/AudioManager';
import { CONFIG } from '../config';
import type { EventBus, GameEvents } from '../core/EventBus';
import type { SeededRandom } from '../core/SeededRandom';
import type { ArenaData } from '../procedural/ArenaTypes';
import type { PlayerController } from '../player/PlayerController';
import type { MaterialLibrary } from '../render/Materials';
import type { Effects } from '../render/Effects';
import { VoxelMeshBuilder, hexToRgb } from '../render/VoxelMeshBuilder';
import type { VoxelWorld } from '../world/VoxelWorld';
import type { WeaponSystem } from '../combat/WeaponSystem';

export type PickupKind = 'health' | 'ammo';

interface Pickup {
  active: boolean;
  kind: PickupKind;
  node: TransformNode;
  /** One instance pair per kind; only the active kind is enabled (no allocation on reuse). */
  meshes: Record<PickupKind, InstancedMesh[]>;
  x: number;
  y: number;
  z: number;
  baseY: number;
  vy: number;
  /** Remaining lifetime; Infinity for map-placed pickups. */
  life: number;
  phase: number;
}

const CAPACITY = 14;

/** Health and ammo pickups: enemy drops (timed) and wave-start map pickups at validated points. */
export class PickupSystem {
  private pickups: Pickup[] = [];
  private sources: Record<PickupKind, { body: Mesh; glow: Mesh }>;
  private world: VoxelWorld | null = null;
  private data: ArenaData | null = null;

  constructor(
    scene: Scene,
    materials: MaterialLibrary,
    private effects: Effects,
    private audio: AudioManager,
    private bus: EventBus<GameEvents>,
  ) {
    const make = (kind: PickupKind, bodyHex: string, trimHex: string, glowHex: string) => {
      const b = new VoxelMeshBuilder();
      b.addBox(0, 0, 0, 0.42, 0.32, 0.42, hexToRgb(bodyHex));
      b.addBox(0, 0.17, 0, 0.46, 0.04, 0.46, hexToRgb(trimHex));
      b.addBox(0, -0.17, 0, 0.46, 0.04, 0.46, hexToRgb(trimHex));
      const body = b.build(`pickup_${kind}_src`, scene);
      body.material = materials.vertexLit('pickup', 0.2);
      const g = new VoxelMeshBuilder();
      const w = { r: 1, g: 1, b: 1 };
      if (kind === 'health') {
        for (const s of [1, -1]) {
          g.addBox(0, 0, s * 0.213, 0.24, 0.07, 0.01, w, { faceShade: false });
          g.addBox(0, 0, s * 0.213, 0.07, 0.24, 0.01, w, { faceShade: false });
          g.addBox(s * 0.213, 0, 0, 0.01, 0.07, 0.24, w, { faceShade: false });
          g.addBox(s * 0.213, 0, 0, 0.01, 0.24, 0.07, w, { faceShade: false });
        }
      } else {
        for (const s of [1, -1]) {
          g.addBox(0, 0.02, s * 0.213, 0.3, 0.08, 0.01, w, { faceShade: false });
          g.addBox(s * 0.213, 0.02, 0, 0.01, 0.08, 0.3, w, { faceShade: false });
        }
      }
      const glow = g.build(`pickup_${kind}_glow_src`, scene, { colors: false });
      glow.material = materials.emissive(glowHex, 1.3);
      for (const m of [body, glow]) {
        m.isPickable = false;
        m.position.set(0, -500, 0);
        m.scaling.set(0.001, 0.001, 0.001);
      }
      return { body, glow };
    };
    this.sources = {
      health: make('health', '#e8ecef', '#9aa3ab', '#ff3b4a'),
      ammo: make('ammo', '#4f5a3a', '#2c3220', '#ffc23a'),
    };

    for (let i = 0; i < CAPACITY; i++) {
      const node = new TransformNode(`pickup_${i}`, scene);
      const pair = (k: PickupKind) =>
        [this.sources[k].body.createInstance(`pk_${k}_${i}`), this.sources[k].glow.createInstance(`pk_${k}_glow_${i}`)].map((m) => {
          m.parent = node;
          m.isPickable = false;
          return m;
        });
      const meshes = { health: pair('health'), ammo: pair('ammo') };
      node.setEnabled(false);
      this.pickups.push({ active: false, kind: 'health', node, meshes, x: 0, y: 0, z: 0, baseY: 0, vy: 0, life: 0, phase: 0 });
    }

    this.bus.on('enemy:killed', (e) => this.onEnemyKilled(e.position.x, e.position.y, e.position.z));
  }

  /** Iron Man challenge disables health pickups. */
  allowHealth = true;
  private player: PlayerController | null = null;
  private weapons: WeaponSystem | null = null;
  private rng: SeededRandom | null = null;

  bind(data: ArenaData, world: VoxelWorld, player: PlayerController, weapons: WeaponSystem, rng: SeededRandom): void {
    this.data = data;
    this.world = world;
    this.player = player;
    this.weapons = weapons;
    this.rng = rng;
    this.clear();
  }

  private onEnemyKilled(x: number, y: number, z: number): void {
    if (!this.player || !this.weapons || !this.rng) return;
    // Bias drops toward what the player actually needs.
    const lowHealth = this.player.health / this.player.maxHealth < 0.5;
    const lowAmmo = this.weapons.reserve < this.weapons.stats.magazineSize * 1.5;
    const r = this.rng.next();
    const pHealth = CONFIG.pickups.healthDropChance * (lowHealth ? 2 : 1);
    const pAmmo = CONFIG.pickups.ammoDropChance * (lowAmmo ? 2 : 1);
    if (r < pHealth && this.allowHealth) this.spawn('health', x, y + 0.8, z, CONFIG.pickups.lifetime);
    else if (r < pHealth + pAmmo) this.spawn('ammo', x, y + 0.8, z, CONFIG.pickups.lifetime);
  }

  /** Places a health and an ammo pickup at validated map points (called between waves). */
  placeMapPickups(): void {
    if (!this.data || !this.rng || this.data.pickupPoints.length === 0) return;
    const pts = this.rng.shuffle([...this.data.pickupPoints]);
    const kinds: PickupKind[] = this.allowHealth ? ['health', 'ammo'] : ['ammo'];
    for (let i = 0; i < kinds.length && i < pts.length; i++) {
      const p = pts[i]!;
      const wx = p.x + 0.5;
      const wz = p.z + 0.5;
      // Don't stack on an existing pickup.
      if (this.pickups.some((k) => k.active && Math.hypot(k.x - wx, k.z - wz) < 1)) continue;
      this.spawn(kinds[i]!, wx, (this.world?.heightAtWorld(wx, wz) ?? 0) + 0.6, wz, Infinity);
    }
  }

  spawn(kind: PickupKind, x: number, y: number, z: number, life: number): void {
    let p = this.pickups.find((k) => !k.active);
    if (!p) {
      // Recycle the timed pickup closest to expiring.
      p = this.pickups.filter((k) => Number.isFinite(k.life)).sort((a, b) => a.life - b.life)[0];
      if (!p) return;
    }
    p.kind = kind;
    for (const k of ['health', 'ammo'] as const) for (const m of p.meshes[k]) m.setEnabled(k === kind);
    p.active = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vy = 2.5;
    p.life = life;
    p.phase = Math.random() * Math.PI * 2;
    p.baseY = (this.world?.heightAtWorld(x, z) ?? 0) + 0.45;
    p.node.setEnabled(true);
  }

  update(dt: number): void {
    const player = this.player;
    for (const p of this.pickups) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        this.despawn(p);
        continue;
      }
      // Pop up, fall, then hover and spin.
      if (p.y > p.baseY || p.vy > 0) {
        p.vy -= 14 * dt;
        p.y = Math.max(p.baseY, p.y + p.vy * dt);
        if (p.y <= p.baseY) p.vy = 0;
      }
      p.phase += dt * 2.2;
      p.node.position.set(p.x, p.y + Math.sin(p.phase) * 0.08, p.z);
      p.node.rotation.y = p.phase;
      // Blink during the last 4 seconds.
      p.node.setEnabled(!(p.life < 4 && Math.floor(p.life * 8) % 2 === 0));

      if (player && player.alive) {
        const dx = player.body.x - p.x;
        const dz = player.body.z - p.z;
        const dy = player.body.y + 0.8 - p.y;
        if (dx * dx + dz * dz < CONFIG.pickups.collectRadius ** 2 && Math.abs(dy) < 1.6) this.tryCollect(p);
      }
    }
  }

  private tryCollect(p: Pickup): void {
    const player = this.player!;
    const weapons = this.weapons!;
    let amount = 0;
    if (p.kind === 'health') {
      if (player.health >= player.maxHealth) return;
      amount = player.heal(CONFIG.pickups.healthAmount);
    } else {
      if (weapons.reserve >= weapons.stats.reserveMax) return;
      amount = weapons.addAmmo(CONFIG.pickups.ammoMagazines);
    }
    this.effects.sparkBurst(p.x, p.y, p.z, 0, 1, 0, 10, 3);
    this.audio.play('pickup');
    this.bus.emit('pickup:collected', { kind: p.kind, amount });
    this.despawn(p);
  }

  private despawn(p: Pickup): void {
    p.active = false;
    p.node.setEnabled(false);
  }

  clear(): void {
    for (const p of this.pickups) this.despawn(p);
  }

  /** For the minimap. */
  forEachActive(fn: (x: number, z: number, kind: PickupKind) => void): void {
    for (const p of this.pickups) if (p.active) fn(p.x, p.z, p.kind);
  }
}
