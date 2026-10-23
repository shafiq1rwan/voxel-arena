import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { CONFIG } from '../config';
import type { EventBus, GameEvents } from '../core/EventBus';
import { approach, clamp, damp } from '../core/MathUtil';
import type { Body, VoxelWorld } from '../world/VoxelWorld';
import type { InputState } from './InputState';

const P = CONFIG.player;

/**
 * Kinematic first-person controller: acceleration-based movement, coyote time + jump buffering,
 * step-up smoothing, head bob, recoil and trauma-based camera shake.
 */
export class PlayerController {
  readonly body: Body = { x: 0, y: 0, z: 0 };
  vx = 0;
  vy = 0;
  vz = 0;
  yaw = 0;
  pitch = 0;
  grounded = true;
  health: number = P.maxHealth;
  maxHealth: number = P.maxHealth;
  alive = true;
  /** Multiplier from upgrades (Quick Feet etc.). */
  speedMultiplier = 1;
  sprinting = false;
  /** 0..1 how fast the player is moving horizontally relative to walk speed. */
  moveAmount = 0;

  /** Lethal hits that will be survived this wave (Last Stand). */
  lastStandCharges = 0;
  dashUnlocked = false;
  /** Seconds until the dash is ready again. */
  dashCooldown = 0;
  readonly dashCooldownMax = 3.5;
  /** Seconds remaining in the current dash (0 when not dashing). */
  dashTime = 0;

  /** Contact-damage grace after a melee hit. */
  private invulnerable = 0;
  /** Full invulnerability frames (dash, last stand). */
  private iframes = 0;
  private dashDirX = 0;
  private dashDirZ = 0;
  private coyote = 0;
  private jumpBuffer = 0;
  private bobPhase = 0;
  private stepSmooth = 0;
  private landDip = 0;
  private trauma = 0;
  private shakeTime = 0;
  private recoilOffset = 0;
  private strafeTilt = 0;
  private world: VoxelWorld | null = null;

  constructor(
    private camera: FreeCamera,
    private bus: EventBus<GameEvents>,
  ) {}

  spawn(world: VoxelWorld, x: number, z: number, yaw: number): void {
    this.world = world;
    this.body.x = x;
    this.body.z = z;
    this.body.y = world.groundHeight(this.body, P.radius);
    this.vx = this.vy = this.vz = 0;
    this.yaw = yaw;
    this.pitch = 0;
    this.health = this.maxHealth = P.maxHealth;
    this.alive = true;
    this.speedMultiplier = 1;
    this.invulnerable = 0;
    this.iframes = 0;
    this.lastStandCharges = 0;
    this.dashUnlocked = false;
    this.dashCooldown = 0;
    this.dashTime = 0;
    this.trauma = 0;
    this.recoilOffset = 0;
    this.stepSmooth = 0;
    this.landDip = 0;
    this.grounded = true;
    this.applyCamera(0);
  }

  get eyeY(): number {
    return this.body.y + P.eyeHeight;
  }

  update(dt: number, input: InputState, aiming: boolean, sensitivityScale: number): void {
    const world = this.world;
    if (!world) return;

    // --- Look ---
    this.yaw += input.lookYaw * sensitivityScale;
    this.pitch = clamp(this.pitch + input.lookPitch * sensitivityScale, -1.5, 1.5);

    if (!this.alive) {
      this.applyCamera(dt);
      return;
    }

    // --- Horizontal movement ---
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    let wishX = input.moveY * sinY + input.moveX * cosY;
    let wishZ = input.moveY * cosY - input.moveX * sinY;
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 1) {
      wishX /= wishLen;
      wishZ /= wishLen;
    }
    this.sprinting = input.sprint && input.moveY > 0.3 && !aiming;
    let speed = (this.sprinting ? P.sprintSpeed : P.walkSpeed) * this.speedMultiplier;
    if (aiming) speed *= 0.65;
    const targetX = wishX * speed;
    const targetZ = wishZ * speed;
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    if (input.abilityPressed && this.dashUnlocked && this.dashCooldown <= 0) {
      // Dash along the movement input, or straight ahead when standing still.
      const len = Math.hypot(wishX, wishZ);
      this.dashDirX = len > 0.1 ? wishX / len : sinY;
      this.dashDirZ = len > 0.1 ? wishZ / len : cosY;
      this.dashTime = 0.17;
      this.dashCooldown = this.dashCooldownMax;
      this.iframes = Math.max(this.iframes, 0.3);
      this.addTrauma(0.12);
      this.bus.emit('player:dashed', {});
    }
    const accel = this.grounded ? (wishLen > 0.01 ? P.groundAccel : P.groundDecel) : P.airAccel;
    // Approach target velocity along the delta vector (keeps diagonal acceleration consistent).
    const dvx = targetX - this.vx;
    const dvz = targetZ - this.vz;
    const dvLen = Math.hypot(dvx, dvz);
    const maxDv = accel * dt;
    if (this.dashTime > 0) {
      this.dashTime -= dt;
      this.vx = this.dashDirX * 21;
      this.vz = this.dashDirZ * 21;
      if (this.dashTime <= 0) {
        // Exit the dash at sprint speed so momentum carries without feeling floaty.
        this.vx = this.dashDirX * P.sprintSpeed;
        this.vz = this.dashDirZ * P.sprintSpeed;
      }
    } else if (dvLen <= maxDv || dvLen < 1e-5) {
      this.vx = targetX;
      this.vz = targetZ;
    } else {
      this.vx += (dvx / dvLen) * maxDv;
      this.vz += (dvz / dvLen) * maxDv;
    }

    const prevY = this.body.y;
    const flags = world.moveHorizontal(this.body, this.vx * dt, this.vz * dt, P.radius, P.stepHeight);
    if (flags & 1) this.vx = 0;
    if (flags & 2) this.vz = 0;

    // --- Vertical movement ---
    const ground = world.groundHeight(this.body, P.radius);
    if (this.grounded && ground > this.body.y && ground - this.body.y <= P.stepHeight + 1e-3) {
      // Step up: snap feet, but keep the camera smooth.
      this.stepSmooth -= ground - this.body.y;
      this.body.y = ground;
    }

    this.coyote = this.grounded ? P.coyoteTime : Math.max(0, this.coyote - dt);
    this.jumpBuffer = input.jumpPressed ? P.jumpBuffer : Math.max(0, this.jumpBuffer - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vy = P.jumpVelocity;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
    }

    if (!this.grounded || this.body.y > ground + 1e-3) {
      // Walking off ledges: small drops (stairs) stay glued to the ground.
      if (this.grounded && this.vy <= 0 && this.body.y - ground <= P.stepHeight + 1e-3) {
        this.stepSmooth += this.body.y - ground;
        this.body.y = ground;
      } else {
        this.grounded = false;
        this.vy -= P.gravity * dt;
        this.body.y += this.vy * dt;
        if (this.body.y <= ground) {
          const impact = -this.vy;
          this.body.y = ground;
          this.vy = 0;
          this.grounded = true;
          if (impact > 4) this.landDip = Math.min(0.18, impact * 0.012);
        }
      }
    }
    // Safety net: never end up inside geometry or below the world.
    if (this.body.y < ground - 0.01 && prevY >= ground - 0.01) this.body.y = ground;
    if (this.body.y < -20) this.body.y = ground + 1;

    this.moveAmount = Math.min(1.5, Math.hypot(this.vx, this.vz) / P.walkSpeed);
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.iframes = Math.max(0, this.iframes - dt);
    this.strafeTilt += (-input.moveX * 0.012 - this.strafeTilt) * damp(8, dt);
    this.applyCamera(dt);
  }

  private applyCamera(dt: number): void {
    // Head bob while walking on the ground.
    if (this.grounded && this.moveAmount > 0.1) this.bobPhase += dt * (6.5 + this.moveAmount * 4);
    const bobAmp = this.grounded ? Math.min(1, this.moveAmount) * 0.035 : 0;
    const bobY = Math.abs(Math.sin(this.bobPhase)) * bobAmp * 1.4;
    const bobX = Math.cos(this.bobPhase) * bobAmp * 0.6;

    this.stepSmooth = approach(this.stepSmooth * (1 - damp(14, dt)), 0, dt * 0.2);
    this.landDip = Math.max(0, this.landDip - dt * 0.9);
    this.recoilOffset *= 1 - damp(9, dt);

    // Trauma shake: amplitude scales with trauma^2 for punchy-but-short shakes.
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.shakeTime += dt * 30;
    const shake = this.trauma * this.trauma;
    const sx = (Math.sin(this.shakeTime * 1.1) + Math.sin(this.shakeTime * 2.3) * 0.5) * shake * 0.035;
    const sy = (Math.sin(this.shakeTime * 1.7 + 1.3) + Math.sin(this.shakeTime * 3.1) * 0.5) * shake * 0.035;
    const sr = Math.sin(this.shakeTime * 1.3 + 2.1) * shake * 0.05;

    const c = this.camera;
    const cosY = Math.cos(this.yaw);
    const sinY = Math.sin(this.yaw);
    c.position.x = this.body.x + cosY * bobX;
    c.position.y = this.body.y + P.eyeHeight + bobY + this.stepSmooth - this.landDip;
    c.position.z = this.body.z - sinY * bobX;
    c.rotation.x = clamp(this.pitch - this.recoilOffset + sy, -1.55, 1.55);
    c.rotation.y = this.yaw + sx;
    c.rotation.z = sr + this.strafeTilt;
  }

  /** Recoil: part of the kick is permanent aim drift, part springs back. */
  kick(pitchUp: number, yaw: number): void {
    this.pitch = clamp(this.pitch - pitchUp * 0.35, -1.5, 1.5);
    this.recoilOffset += pitchUp * 0.65;
    this.yaw += yaw;
  }

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Returns true if damage was applied. */
  damage(amount: number, fromX: number, fromZ: number, contact: boolean): boolean {
    if (!this.alive || this.iframes > 0) return false;
    if (contact && this.invulnerable > 0) return false;
    if (this.health - amount <= 0 && this.lastStandCharges > 0) {
      // Last Stand: cling on at 1 HP with a moment of invulnerability to escape.
      this.lastStandCharges--;
      this.health = 1;
      this.iframes = 1.2;
      this.addTrauma(0.7);
      this.bus.emit('player:damaged', { amount, fromX, fromZ, health: this.health });
      this.bus.emit('player:lastStand', {});
      return true;
    }
    this.health = Math.max(0, this.health - amount);
    if (contact) this.invulnerable = P.contactInvulnerability;
    this.addTrauma(Math.min(0.6, 0.18 + amount * 0.025));
    this.bus.emit('player:damaged', { amount, fromX, fromZ, health: this.health });
    if (this.health <= 0) this.alive = false;
    return true;
  }

  /** Sets max health (e.g. from Reinforced Armor) without changing current health. */
  setMaxHealth(max: number): void {
    this.maxHealth = max;
    this.health = Math.min(this.health, max);
  }

  /** 0 = ready, 1 = just used. */
  get dashCooldown01(): number {
    return this.dashCooldown / this.dashCooldownMax;
  }

  heal(amount: number): number {
    const before = this.health;
    this.health = Math.min(this.maxHealth, this.health + amount);
    const healed = this.health - before;
    if (healed > 0) this.bus.emit('player:healed', { amount: healed, health: this.health });
    return healed;
  }
}
