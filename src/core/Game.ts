import { AudioManager } from '../audio/AudioManager';
import { DamageSystem } from '../combat/DamageSystem';
import { HitDetection } from '../combat/HitDetection';
import { ProjectileSystem } from '../combat/ProjectileSystem';
import { WeaponSystem } from '../combat/WeaponSystem';
import { WeaponViewModel } from '../combat/WeaponViewModel';
import type { WeaponFamily } from '../combat/WeaponTypes';
import { CONFIG, QUALITY_PRESETS } from '../config';
import { EnemyAI } from '../enemies/EnemyAI';
import { EnemyPool } from '../enemies/EnemyPool';
import { EnemySpawner } from '../enemies/EnemySpawner';
import { PickupSystem } from '../pickups/PickupSystem';
import { createPlatform } from '../platform/createPlatform';
import type { PlatformAdapter } from '../platform/PlatformAdapter';
import { InputManager } from '../player/InputManager';
import { PlayerController } from '../player/PlayerController';
import { generateArena } from '../procedural/ArenaGenerator';
import { THEME_IDS, type ThemeId, type ArenaData, type ArenaOptions } from '../procedural/ArenaTypes';
import { THEMES, type ThemePalette } from '../procedural/Themes';
import { createWeapon } from '../procedural/WeaponGenerator';
import { SaveManager, type Settings } from '../progression/SaveManager';
import { DEFAULT_SKIN_ID, SKINS } from '../progression/Skins';
import { Effects } from '../render/Effects';
import { HUD } from '../ui/HUD';
import { MainMenu } from '../ui/MainMenu';
import { PauseMenu } from '../ui/PauseMenu';
import { ResultsScreen } from '../ui/ResultsScreen';
import { SettingsPanel } from '../ui/SettingsPanel';
import { HowToPlay } from '../ui/HowToPlay';
import { WaveManager, WavePhase } from '../waves/WaveManager';
import { UpgradeManager } from '../upgrades/UpgradeManager';
import { MODIFIER_CAPS, UPGRADES, type UpgradeId } from '../upgrades/UpgradeTypes';
import { UpgradeScreen } from '../ui/UpgradeScreen';
import { ArenaRenderer } from '../world/ArenaRenderer';
import { NavGrid } from '../world/NavGrid';
import { VoxelWorld } from '../world/VoxelWorld';
import { Analytics } from './Analytics';
import { EventBus, type GameEvents } from './EventBus';
import { AppState, GameStateMachine } from './GameState';
import { lerp } from './MathUtil';
import { SceneManager } from './SceneManager';
import { SeededRandom, codeToSeed, randomSeed, seedToCode } from './SeededRandom';

const ARENA_OPTIONS: ArenaOptions = {
  interiorSize: CONFIG.arena.size,
  boundaryHeight: CONFIG.arena.boundaryHeight,
  centerClearRadius: CONFIG.arena.centerClearRadius,
  perimeterMargin: CONFIG.arena.perimeterMargin,
  minSpawnDistance: CONFIG.arena.minSpawnDistance,
};

interface RunState {
  seed: number;
  timeSec: number;
  kills: number;
  score: number;
  wavesCompleted: number;
  deathTimer: number;
}

/**
 * Composition root and application state machine. Owns every system, routes events between
 * them, and drives the per-frame update order. Systems never reach into each other directly.
 */
export class Game {
  readonly bus = new EventBus<GameEvents>();
  readonly state = new GameStateMachine();
  readonly sm: SceneManager;
  readonly save = new SaveManager();
  readonly audio = new AudioManager();
  readonly input: InputManager;
  readonly platform: PlatformAdapter;
  readonly analytics: Analytics;

  private effects: Effects;
  private pool: EnemyPool;
  private damage: DamageSystem;
  private hits: HitDetection;
  private viewModel: WeaponViewModel;
  private weapons: WeaponSystem;
  private spawner: EnemySpawner;
  private waves: WaveManager;
  private pickups: PickupSystem;
  private player: PlayerController;
  private projectiles: ProjectileSystem;
  private upgrades = new UpgradeManager();
  private upgradeRng = new SeededRandom(1);
  private ai: EnemyAI | null = null;
  private arenaRenderer: ArenaRenderer;

  private hud: HUD;
  private menu: MainMenu;
  private pauseMenu: PauseMenu;
  private results: ResultsScreen;
  private settingsPanel: SettingsPanel;
  private upgradeScreen: UpgradeScreen;
  private howToPlay: HowToPlay;
  /** Seconds until the upgrade screen opens after a wave is cleared (lets the banner land). */
  private rewardDelay = 0;
  private regenTimer = 0;

  private arena: ArenaData | null = null;
  private theme: ThemePalette = THEMES.ruins;
  private world: VoxelWorld | null = null;
  private nav: NavGrid | null = null;
  private run: RunState = { seed: 0, timeSec: 0, kills: 0, score: 0, wavesCompleted: 0, deathTimer: 0 };
  private runsThisSession = 0;
  private menuOrbit = 0;
  private debug = false;
  private minimapTimer = 0;
  private fpsSmoothed = 60;
  private resumePending = false;
  private readonly testMode: boolean;
  private readonly isTouch: boolean;
  private enemyBlips: { x: number; z: number; kind: string }[] = [];
  private pickupBlips: { x: number; z: number; kind: string }[] = [];

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    const params = new URLSearchParams(location.search);
    this.testMode = params.has('test');
    this.debug = params.has('debug');
    this.isTouch = window.matchMedia?.('(pointer: coarse)').matches ?? false;

    this.sm = new SceneManager(canvas);
    this.input = new InputManager(canvas);
    this.input.desktop.requireLock = !this.testMode;
    this.platform = createPlatform();
    this.analytics = new Analytics(this.bus);

    const scene = this.sm.scene;
    const mats = this.sm.materials;
    this.arenaRenderer = new ArenaRenderer(scene, mats);
    this.effects = new Effects(scene, mats);
    this.pool = new EnemyPool(scene, mats, 24);
    this.damage = new DamageSystem(this.pool, this.effects, this.audio, this.bus);
    this.hits = new HitDetection(() => this.world);
    this.viewModel = new WeaponViewModel(scene, this.sm.camera, mats);
    this.weapons = new WeaponSystem(this.sm.camera, this.viewModel, this.hits, this.damage, this.pool, this.effects, this.audio, this.bus, this.sm.muzzleLight);
    this.spawner = new EnemySpawner(this.pool, this.effects, this.audio);
    this.waves = new WaveManager(this.spawner, this.pool, this.bus);
    this.pickups = new PickupSystem(scene, mats, this.effects, this.audio, this.bus);
    this.player = new PlayerController(this.sm.camera, this.bus);
    this.projectiles = new ProjectileSystem(scene, mats, this.effects, this.audio);

    this.hud = new HUD(uiRoot);
    this.menu = new MainMenu(uiRoot, this.isTouch);
    this.pauseMenu = new PauseMenu(uiRoot);
    this.results = new ResultsScreen(uiRoot);
    this.settingsPanel = new SettingsPanel(uiRoot);
    this.upgradeScreen = new UpgradeScreen(uiRoot);
    this.howToPlay = new HowToPlay(uiRoot);

    this.wireUi();
    this.wireEvents();
    this.applySettings(this.save.data.settings);
  }

  // ------------------------------------------------------------------ setup

  async start(loadStart: number): Promise<void> {
    await this.platform.init();
    this.enterMenu();
    await this.sm.scene.whenReadyAsync();
    this.platform.gameLoadingFinished();
    this.bus.emit('game:loaded', { loadMs: performance.now() - loadStart });

    this.sm.engine.runRenderLoop(() => {
      const frameMs = this.sm.engine.getDeltaTime();
      const dt = Math.min(0.05, frameMs / 1000);
      if (this.state.is(AppState.Playing, AppState.MainMenu)) this.sm.updateAdaptiveResolution(frameMs);
      this.update(dt);
      this.sm.scene.render();
    });

    const params = new URLSearchParams(location.search);
    const urlSeed = params.get('seed') ?? '';
    if (urlSeed) this.menu.setSeed(urlSeed);
    if (this.testMode && params.has('autostart')) void this.startRun(urlSeed);
  }

  private wireUi(): void {
    this.menu.onPlay = (seedText) => {
      this.audio.unlock();
      this.audio.play('click');
      void this.startRun(seedText);
    };
    this.menu.onSettings = () => this.openSettings();
    this.menu.onHowToPlay = () => this.openHowToPlay();
    this.pauseMenu.onHowToPlay = () => this.openHowToPlay();
    this.howToPlay.onClose = () => {
      this.howToPlay.close();
      this.audio.play('click');
    };
    this.pauseMenu.onResume = () => this.resume();
    this.pauseMenu.onSettings = () => this.openSettings();
    this.pauseMenu.onQuit = () => this.quitToMenu();
    this.results.onRetry = () => {
      this.audio.play('click');
      this.bus.emit('run:retry', { seed: this.run.seed });
      void this.startRun('');
    };
    this.results.onMenu = () => this.quitToMenu();
    this.upgradeScreen.onChoose = (id) => void this.chooseUpgrade(id);
    this.waves.onRewardPhase = () => {
      this.rewardDelay = 1.6;
    };
    this.hud.onPauseClick = () => this.pause();
    this.settingsPanel.onChange = (patch) => {
      this.save.updateSettings(patch);
      this.applySettings(this.save.data.settings);
    };
    this.settingsPanel.onClose = () => {
      this.settingsPanel.close();
      this.audio.play('click');
    };

    this.input.desktop.onLockLost = () => {
      if (this.state.is(AppState.Playing)) this.pause();
    };

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.state.is(AppState.Playing)) this.pause();
        this.audio.setMuted(true);
      } else if (!this.state.is(AppState.AdBreak)) {
        this.audio.setMuted(false);
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3') {
        e.preventDefault();
        this.debug = !this.debug;
      }
    });
  }

  private wireEvents(): void {
    const bus = this.bus;
    bus.on('enemy:damaged', (e) => this.hud.hit(e.killed ? 'kill' : e.headshot || e.critical ? 'crit' : 'normal'));
    bus.on('enemy:killed', (e) => {
      this.run.kills++;
      this.run.score += 10 + (e.headshot ? 5 : 0);
    });
    bus.on('player:damaged', (e) => this.hud.damaged(e.fromX, e.fromZ, e.amount));
    bus.on('wave:started', (e) => {
      this.audio.play('waveStart');
      this.player.lastStandCharges = this.upgrades.modifiers.lastStandPerWave;
      this.regenTimer = 0;
      const shooters = this.waves.shootersThisWave;
      if (e.wave > 1) this.hud.toast(shooters ? `${e.totalEnemies} enemies · ${shooters} shooters` : `${e.totalEnemies} enemies incoming`, 2);
    });
    bus.on('player:dashed', () => this.audio.play('dash'));
    bus.on('player:lastStand', () => {
      this.audio.play('lastStand');
      this.hud.toast('LAST STAND!', 1.6);
    });
    bus.on('explosion', (e) => {
      const d = Math.hypot(e.x - this.player.body.x, e.z - this.player.body.z);
      if (d < 12) this.player.addTrauma(0.25 * (1 - d / 12));
    });
    bus.on('wave:completed', (e) => {
      this.run.wavesCompleted = e.wave;
      this.run.score += 50 * e.wave;
      this.audio.play('waveClear');
      this.pickups.placeMapPickups();
      // Small resupply so a cleared wave never leaves the player stranded without ammo.
      this.weapons.addAmmo(1);
    });
    bus.on('pickup:collected', (e) => this.hud.toast(e.kind === 'health' ? `+${Math.round(e.amount)} HEALTH` : `+${e.amount} AMMO`, 1.2));
  }

  private applySettings(s: Settings): void {
    this.input.setSensitivity(s.mouseSensitivity, s.invertY);
    this.audio.setVolume(s.volume);
    if (this.sm.qualityLevel !== s.quality || !this.qualityApplied) {
      this.sm.setQuality(s.quality);
      this.effects.density = QUALITY_PRESETS[s.quality].particleScale;
      this.qualityApplied = true;
    }
  }
  private qualityApplied = false;

  private openHowToPlay(): void {
    this.audio.play('click');
    this.howToPlay.open();
  }

  private openSettings(): void {
    this.audio.play('click');
    this.settingsPanel.open(this.save.data.settings);
  }

  // ------------------------------------------------------------------ arena

  private loadArena(seed: number): void {
    // Each seed picks its own theme; `?theme=` can force one for testing.
    const requested = new URLSearchParams(location.search).get('theme');
    const themeId = THEME_IDS.includes(requested as ThemeId) ? (requested as ThemeId) : undefined;
    const data = generateArena(seed, themeId ? { ...ARENA_OPTIONS, themeId } : ARENA_OPTIONS);
    this.arena = data;
    this.theme = THEMES[data.themeId];
    this.sm.applyTheme(this.theme);
    this.arenaRenderer.build(data, this.theme);
    this.world = new VoxelWorld(data);
    this.nav = new NavGrid(data);
    this.nav.compute(data.playerStart.x, data.playerStart.z);
    this.effects.setWorld(this.world);
    this.effects.clear();
    this.hud.minimap.setArena(data, this.theme);
  }

  // ------------------------------------------------------------------ state transitions

  private enterMenu(): void {
    this.state.set(AppState.MainMenu);
    this.platform.gameplayStop();
    this.input.desktop.setEnabled(false);
    this.input.desktop.exitLock();
    this.waves.stop();
    this.pool.releaseAll();
    this.pickups.clear();
    this.projectiles.clear();
    this.upgradeScreen.hide();
    this.hud.hide();
    this.pauseMenu.hide();
    this.results.hide();
    this.viewModel.setVisible(false);
    // A fresh procedural arena behind the menu previews the variety on offer.
    this.loadArena(randomSeed());
    this.menu.setBackdropArena(`${this.theme.name} · ${seedToCode(this.arena!.seed)}`);
    this.menu.show(this.save.data.records);
  }

  private async startRun(seedText: string): Promise<void> {
    if (this.state.is(AppState.AdBreak)) return;
    // Request pointer lock synchronously inside the click gesture.
    const lockPromise = this.testMode ? Promise.resolve(true) : this.input.desktop.requestLock();

    this.menu.hide();
    this.results.hide();
    this.pauseMenu.hide();

    // Natural break between runs (never before the very first run of a session).
    if (this.runsThisSession > 0) {
      let adStarted = false;
      this.state.set(AppState.AdBreak);
      await this.platform.commercialBreak(() => {
        adStarted = true;
        this.audio.setMuted(true);
        this.input.desktop.setEnabled(false);
        this.input.desktop.exitLock();
      });
      if (adStarted) this.audio.setMuted(false);
    }
    this.runsThisSession++;

    const trimmed = seedText.trim();
    const seed = trimmed ? codeToSeed(trimmed) : randomSeed();
    this.loadArena(seed);
    const data = this.arena!;
    const world = this.world!;

    this.run = { seed, timeSec: 0, kills: 0, score: 0, wavesCompleted: 0, deathTimer: 0 };
    const c = data.size / 2;
    // Every theme opens framed on the tallest gatehouse.
    this.player.spawn(world, data.playerStart.x + 0.5, data.playerStart.z + 0.5, Math.atan2(data.size * 0.36 - c, data.size - c));

    const family: WeaponFamily = 'rifle';
    const weapon = createWeapon(family, new SeededRandom(seed).fork('weapon'));
    const skin = SKINS[DEFAULT_SKIN_ID]!;
    this.weapons.equip(weapon, skin);
    this.viewModel.setVisible(true);
    this.hud.setWeapon(weapon, skin);
    this.hud.resetRun(this.player.maxHealth);

    this.pool.releaseAll();
    this.damage.resetRun();
    this.upgrades.reset();
    this.upgradeRng = new SeededRandom(seed).fork('upgrades');
    this.applyUpgrades(null);
    this.hud.setBuild([], false);
    this.upgradeScreen.hide();
    this.rewardDelay = 0;
    this.regenTimer = 0;
    this.projectiles.bind(world, this.player);
    this.spawner.setArena(data, world, seed);
    const aiCtx = { world, nav: this.nav!, player: this.player, audio: this.audio, projectiles: this.projectiles, effects: this.effects };
    if (!this.ai) this.ai = new EnemyAI(this.pool, aiCtx);
    else this.ai.setContext(aiCtx);
    this.pickups.bind(data, world, this.player, this.weapons, new SeededRandom(seed).fork('pickups'));
    this.waves.start(seed);

    this.hud.show();
    this.state.set(AppState.Playing);
    this.bus.emit('run:started', { seed, theme: data.themeId, weapon: weapon.name });

    const locked = await lockPromise;
    if (locked || this.testMode) {
      this.input.desktop.setEnabled(true);
      this.platform.gameplayStart();
    } else {
      // Lock was refused (or an ad consumed the gesture): wait for one more click.
      this.pause('Click RESUME to start');
    }
  }

  // ------------------------------------------------------------------ upgrades

  private openUpgradeScreen(): void {
    const offered = this.upgrades.offer(this.upgradeRng);
    if (offered.length === 0) {
      // Every upgrade is maxed: nothing to choose, continue straight to the next wave.
      this.waves.completeReward();
      return;
    }
    this.state.set(AppState.Upgrade);
    this.platform.gameplayStop();
    this.input.desktop.setEnabled(false);
    this.input.reset();
    this.input.desktop.exitLock();
    this.hud.hideBanner();
    this.bus.emit('upgrade:offered', { wave: this.waves.wave, ids: offered.map((d) => d.id) });
    this.upgradeScreen.show(this.waves.wave, offered, (id) => this.upgrades.stacksOf(id), this.upgrades.owned);
  }

  private async chooseUpgrade(id: UpgradeId): Promise<void> {
    if (!this.state.is(AppState.Upgrade)) return;
    // Re-capture the mouse inside the click/keypress gesture that picked the card.
    const lockPromise = this.testMode ? Promise.resolve(true) : this.input.desktop.requestLock();
    if (!this.upgrades.choose(id)) return;
    this.applyUpgrades(id);
    const def = UPGRADES[id];
    const stacks = this.upgrades.stacksOf(id);
    this.audio.play('upgrade');
    this.bus.emit('upgrade:selected', {
      id,
      wave: this.waves.wave,
      stacks,
      build: this.upgrades.owned.map((o) => `${o.def.id}:${o.stacks}`).join(','),
    });
    this.hud.setBuild(this.upgrades.owned, this.player.dashUnlocked);
    this.hud.toast(`${def.name.toUpperCase()}${stacks > 1 ? ` x${stacks}` : ''} ACQUIRED`, 1.8);
    this.upgradeScreen.hide();
    this.waves.completeReward();
    this.state.set(AppState.Playing);

    const locked = await lockPromise;
    if (!this.state.is(AppState.Playing)) return;
    if (locked) {
      this.input.desktop.setEnabled(true);
      this.platform.gameplayStart();
    } else {
      this.pause('Click RESUME to continue');
    }
  }

  /** Pushes the run's aggregate upgrade modifiers into every affected system. */
  private applyUpgrades(justTaken: UpgradeId | null): void {
    const m = this.upgrades.modifiers;
    this.weapons.applyModifiers(m);
    this.player.speedMultiplier = Math.min(MODIFIER_CAPS.moveMul, m.moveMul);
    this.player.setMaxHealth(CONFIG.player.maxHealth + m.maxHealthAdd);
    this.player.dashUnlocked = m.dash;
    this.damage.explosiveLevel = m.explosiveLevel;
    if (justTaken === 'reinforcedArmor') this.player.heal(20);
    if (justTaken === 'lastStand') this.player.lastStandCharges = m.lastStandPerWave;
  }

  private pause(info?: string): void {
    if (!this.state.is(AppState.Playing)) return;
    this.state.set(AppState.Paused);
    this.platform.gameplayStop();
    this.input.desktop.setEnabled(false);
    this.input.reset();
    this.input.desktop.exitLock();
    this.hud.hideBanner();
    this.pauseMenu.show({
      wave: this.waves.wave,
      timeSec: this.run.timeSec,
      kills: this.run.kills,
      score: this.run.score,
      arena: `${this.theme.name} · Seed ${seedToCode(this.run.seed)}`,
      build: this.upgrades.owned,
      message: info,
    });
  }

  private async resume(): Promise<void> {
    if (!this.state.is(AppState.Paused) || this.resumePending) return;
    this.audio.unlock();
    this.audio.play('click');
    this.resumePending = true;
    const ok = this.testMode ? true : await this.input.desktop.requestLock();
    this.resumePending = false;
    if (!ok) {
      this.pauseMenu.setHint('The browser needs a moment before re-capturing the mouse — click RESUME again.');
      return;
    }
    this.pauseMenu.hide();
    this.settingsPanel.close();
    this.howToPlay.close();
    this.state.set(AppState.Playing);
    this.input.desktop.setEnabled(true);
    this.platform.gameplayStart();
  }

  private quitToMenu(): void {
    this.audio.play('click');
    if (this.state.is(AppState.Playing, AppState.Paused, AppState.Upgrade) && this.run.timeSec > 1) this.finishRun(false, false);
    this.enterMenu();
  }

  private onPlayerDeath(): void {
    this.run.deathTimer = 1.6;
    this.audio.play('death');
    this.bus.emit('player:died', { wave: this.waves.wave });
    this.platform.gameplayStop();
    this.input.desktop.setEnabled(false);
    this.viewModel.setVisible(false);
  }

  private finishRun(victory: boolean, showResults: boolean): void {
    const r = this.run;
    const ws = this.weapons.runStats;
    const wave = this.waves.wave;
    const outcome = this.save.recordRun({ wave, kills: r.kills, headshots: ws.headshots, timeSec: r.timeSec, score: r.score, seed: r.seed });
    this.bus.emit('run:ended', { victory, wave, kills: r.kills, timeSec: r.timeSec, seed: r.seed });
    this.waves.stop();
    if (!showResults) return;
    this.state.set(AppState.GameOver);
    this.input.desktop.exitLock();
    this.hud.hide();
    this.results.show({
      victory,
      wave,
      wavesCompleted: r.wavesCompleted,
      kills: r.kills,
      timeSec: r.timeSec,
      score: r.score,
      accuracy: ws.shotsFired > 0 ? ws.shotsHit / ws.shotsFired : 0,
      headshots: ws.headshots,
      weaponName: this.weapons.def.name,
      seedCode: seedToCode(r.seed),
      themeName: this.theme.name,
      newBestWave: outcome.newBestWave,
      newHighScore: outcome.newHighScore,
      bestWave: this.save.data.records.bestWave,
      build: this.upgrades.owned,
    });
  }

  // ------------------------------------------------------------------ frame update

  private update(dt: number): void {
    this.fpsSmoothed = lerp(this.fpsSmoothed, 1 / Math.max(1e-3, this.sm.engine.getDeltaTime() / 1000), 0.05);
    switch (this.state.state) {
      case AppState.MainMenu:
        this.updateMenuCamera(dt);
        this.effects.update(dt);
        break;
      case AppState.Playing:
        this.updatePlaying(dt);
        break;
      case AppState.GameOver:
      case AppState.Upgrade:
        this.effects.update(dt);
        break;
      default:
        break;
    }
    this.hud.setFps(this.save.data.settings.showFps || this.debug, this.fpsSmoothed);
  }

  private updateMenuCamera(dt: number): void {
    if (!this.arena) return;
    this.menuOrbit += dt * 0.06;
    const c = this.arena.size / 2;
    const cam = this.sm.camera;
    const r = 24;
    cam.position.set(c + Math.sin(this.menuOrbit) * r, 13, c + Math.cos(this.menuOrbit) * r);
    const dx = c - cam.position.x;
    const dz = c - cam.position.z;
    cam.rotation.set(Math.atan2(cam.position.y - 1, Math.hypot(dx, dz)), Math.atan2(dx, dz), 0);
    this.sm.setFov(60);
  }

  private updatePlaying(dt: number): void {
    const input = this.input.update();
    const player = this.player;
    const settings = this.save.data.settings;

    if (input.pausePressed && this.run.deathTimer <= 0) {
      this.pause();
      return;
    }

    if (this.run.deathTimer > 0) {
      // Death camera: slump to the floor, then show results.
      this.run.deathTimer -= dt;
      const cam = this.sm.camera;
      cam.position.y = lerp(cam.position.y, player.body.y + 0.35, dt * 3);
      cam.rotation.z = lerp(cam.rotation.z, 0.6, dt * 2.5);
      cam.rotation.x = lerp(cam.rotation.x, -0.25, dt * 2);
      this.ai?.update(dt);
      this.projectiles.update(dt);
      this.effects.update(dt);
      if (this.run.deathTimer <= 0) this.finishRun(false, true);
      return;
    }

    this.run.timeSec += dt;
    const ads = this.weapons.ads;
    player.update(dt, input, input.aim, ads > 0.5 ? 0.75 : 1);
    this.weapons.update(dt, input, player, player.alive);
    this.ai?.update(dt);
    this.projectiles.update(dt);
    this.damage.update();
    this.waves.update(dt, player);
    this.pickups.update(dt);
    this.effects.update(dt);

    // Regeneration ticks only while a wave is actually being fought.
    const regen = this.upgrades.modifiers.regenPer10s;
    if (regen > 0 && player.alive && (this.waves.phase === WavePhase.Spawning || this.waves.phase === WavePhase.Combat)) {
      this.regenTimer += dt;
      if (this.regenTimer >= 10) {
        this.regenTimer -= 10;
        player.heal(regen);
      }
    }

    // Upgrade screen opens shortly after the wave-clear banner.
    if (this.rewardDelay > 0) {
      this.rewardDelay -= dt;
      if (this.rewardDelay <= 0 && player.alive && this.waves.phase === WavePhase.Reward) {
        this.openUpgradeScreen();
        return;
      }
    }

    // ADS zoom, plus a short FOV kick while dashing.
    this.sm.setFov(settings.fov * (1 - 0.2 * ads) * (player.dashTime > 0 ? 1.08 : 1));

    if (!player.alive) {
      this.onPlayerDeath();
      return;
    }

    const w = this.waves;
    this.hud.update(dt, {
      health: player.health,
      maxHealth: player.maxHealth,
      ammo: this.weapons.ammo,
      reserve: this.weapons.reserve,
      magazineSize: this.weapons.stats.magazineSize,
      reloadProgress: this.weapons.reloadProgress,
      wave: w.wave,
      phase: w.phase,
      phaseTimer: w.phaseTimer,
      killedThisWave: w.killedThisWave,
      totalThisWave: w.totalThisWave,
      kills: this.run.kills,
      score: this.run.score,
      spread: this.weapons.currentSpread(player),
      fov: this.sm.camera.fov,
      ads,
      playerX: player.body.x,
      playerZ: player.body.z,
      yaw: player.yaw,
      waveLabel: w.label,
      dashCooldown: player.dashUnlocked ? player.dashCooldown01 : undefined,
    });

    this.minimapTimer -= dt;
    if (this.minimapTimer <= 0) {
      this.minimapTimer = 1 / 30;
      this.drawMinimap();
    }
    this.updateDebug();
  }

  private drawMinimap(): void {
    const enemies = this.enemyBlips;
    enemies.length = 0;
    for (const e of this.pool.active) if (e.alive) enemies.push({ x: e.body.x, z: e.body.z, kind: e.archetype.id });
    const pickups = this.pickupBlips;
    pickups.length = 0;
    this.pickups.forEachActive((x, z, kind) => pickups.push({ x, z, kind }));
    this.hud.minimap.debug = this.debug;
    this.hud.minimap.draw(this.player.body.x, this.player.body.z, this.player.yaw, enemies, pickups, this.debug ? this.arena?.spawnPoints : undefined, this.nav ?? undefined);
  }

  private updateDebug(): void {
    if (!this.debug || !this.arena) {
      this.hud.setDebug(null);
      return;
    }
    const a = this.arena;
    const p = this.player.body;
    this.hud.setDebug(
      [
        `seed ${seedToCode(a.seed)} (${a.seed})  attempts ${a.attempts}`,
        `theme ${a.themeId}  symmetry ${a.symmetry}`,
        `spawns ${a.spawnPoints.length}  pickups ${a.pickupPoints.length}`,
        `pos ${p.x.toFixed(1)} ${p.y.toFixed(2)} ${p.z.toFixed(1)}  ground ${this.player.grounded}`,
        `wave ${this.waves.wave} ${this.waves.phase}  alive ${this.pool.aliveCount}  remaining ${this.waves.remaining}`,
        `active meshes ${this.sm.scene.getActiveMeshes().length}  quality ${this.sm.qualityLevel}  render scale ${Math.round(this.sm.renderScale * 100)}%  projectiles ${this.projectiles.activeCount}`,
        `build ${this.upgrades.owned.map((o) => `${o.def.id}${o.stacks > 1 ? 'x' + o.stacks : ''}`).join(' ') || '-'}`,
      ].join('\n'),
    );
  }
}

