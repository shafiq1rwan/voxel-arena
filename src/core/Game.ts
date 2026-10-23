import { AudioManager } from '../audio/AudioManager';
import { DamageSystem } from '../combat/DamageSystem';
import { GrenadeSystem } from '../combat/GrenadeSystem';
import { HitDetection } from '../combat/HitDetection';
import { ProjectileSystem } from '../combat/ProjectileSystem';
import { WeaponSystem } from '../combat/WeaponSystem';
import { WeaponViewModel } from '../combat/WeaponViewModel';
import { WEAPON_FAMILIES, type WeaponDefinition, type WeaponFamily } from '../combat/WeaponTypes';
import { CONFIG, QUALITY_PRESETS } from '../config';
import type { Enemy } from '../enemies/Enemy';
import { EnemyAI } from '../enemies/EnemyAI';
import { EnemyPool } from '../enemies/EnemyPool';
import { EnemySpawner } from '../enemies/EnemySpawner';
import { ARCHETYPES, type ArchetypeId } from '../enemies/EnemyTypes';
import { PickupSystem } from '../pickups/PickupSystem';
import { WeaponCrates } from '../pickups/WeaponCrates';
import { createPlatform } from '../platform/createPlatform';
import type { PlatformAdapter } from '../platform/PlatformAdapter';
import { AimAssist } from '../player/AimAssist';
import { InputManager } from '../player/InputManager';
import { PlayerController } from '../player/PlayerController';
import { TouchInput } from '../player/TouchInput';
import { generateArena } from '../procedural/ArenaGenerator';
import { THEME_IDS, type ArenaData, type ArenaOptions, type ThemeId } from '../procedural/ArenaTypes';
import { THEMES, type ThemePalette } from '../procedural/Themes';
import { createWeapon } from '../procedural/WeaponGenerator';
import { ProgressionTracker } from '../progression/ProgressionTracker';
import { SaveManager, type Settings } from '../progression/SaveManager';
import { SKINS, skinFor, type SkinDef } from '../progression/Skins';
import { UNLOCKS, scrapForRun } from '../progression/UnlockManager';
import { Effects } from '../render/Effects';
import { Telegraphs } from '../render/Telegraphs';
import { HowToPlay } from '../ui/HowToPlay';
import { HUD } from '../ui/HUD';
import { LoadoutScreen } from '../ui/LoadoutScreen';
import { MainMenu } from '../ui/MainMenu';
import { AchievementsScreen, SkinsScreen, UnlockShop } from '../ui/MenuScreens';
import { Notifier } from '../ui/Notifier';
import { PauseMenu } from '../ui/PauseMenu';
import { ResultsScreen } from '../ui/ResultsScreen';
import { ReviveScreen } from '../ui/ReviveScreen';
import { SettingsPanel } from '../ui/SettingsPanel';
import { UpgradeScreen } from '../ui/UpgradeScreen';
import { SynergyManager } from '../upgrades/SynergyManager';
import { UpgradeManager } from '../upgrades/UpgradeManager';
import { MODIFIER_CAPS, UPGRADES, type UpgradeId } from '../upgrades/UpgradeTypes';
import { FINAL_WAVE } from '../waves/ThreatBudget';
import { WaveManager, WavePhase } from '../waves/WaveManager';
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

/** Waves after which a weapon crate appears (standard mode); endless adds one every 2 waves. */
const CRATE_WAVES = new Set([2, 4, 6, 8]);
const CROSSHAIR_COLORS: Record<string, string> = { white: '#ffffff', green: '#5dff8a', yellow: '#ffd257', cyan: '#4fe3ff', magenta: '#ff5fd8' };

interface RunState {
  seed: number;
  timeSec: number;
  kills: number;
  score: number;
  wavesCompleted: number;
  deathTimer: number;
  victoryTimer: number;
  endless: boolean;
  modifiers: string[];
  reviveUsed: boolean;
  bossesDefeated: number;
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
  readonly progression: ProgressionTracker;

  private effects: Effects;
  private telegraphs: Telegraphs;
  private pool: EnemyPool;
  private damage: DamageSystem;
  private hits: HitDetection;
  private viewModel: WeaponViewModel;
  private weapons: WeaponSystem;
  private grenades: GrenadeSystem;
  private spawner: EnemySpawner;
  private waves: WaveManager;
  private pickups: PickupSystem;
  private crates: WeaponCrates;
  private player: PlayerController;
  private projectiles: ProjectileSystem;
  private upgrades = new UpgradeManager();
  private synergy = new SynergyManager();
  private upgradeRng = new SeededRandom(1);
  private lootRng = new SeededRandom(1);
  private ai: EnemyAI | null = null;
  private arenaRenderer: ArenaRenderer;
  private touch: TouchInput | null = null;
  private aimAssist = new AimAssist();

  private hud: HUD;
  private menu: MainMenu;
  private loadout: LoadoutScreen;
  private pauseMenu: PauseMenu;
  private results: ResultsScreen;
  private settingsPanel: SettingsPanel;
  private upgradeScreen: UpgradeScreen;
  private howToPlay: HowToPlay;
  private shop: UnlockShop;
  private achievementsScreen: AchievementsScreen;
  private skinsScreen: SkinsScreen;
  private notifier: Notifier;
  private revive: ReviveScreen;

  private arena: ArenaData | null = null;
  private theme: ThemePalette = THEMES.ruins;
  private world: VoxelWorld | null = null;
  private nav: NavGrid | null = null;
  private run: RunState = this.freshRun(0);
  private runsThisSession = 0;
  private menuOrbit = 0;
  private debug = false;
  private minimapTimer = 0;
  private fpsSmoothed = 60;
  private resumePending = false;
  /** Seconds until the upgrade screen opens after a wave is cleared (lets the banner land). */
  private rewardDelay = 0;
  private regenTimer = 0;
  private boss: Enemy | null = null;
  private weaponSig = '';
  private pendingSeedText = '';
  private readonly testMode: boolean;
  private readonly isTouch: boolean;
  private enemyBlips: { x: number; z: number; kind: string }[] = [];
  private pickupBlips: { x: number; z: number; kind: string }[] = [];
  private qualityApplied = false;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    const params = new URLSearchParams(location.search);
    this.testMode = params.has('test');
    this.debug = params.has('debug');
    this.isTouch = params.has('touch') || (window.matchMedia?.('(pointer: coarse)').matches ?? false);
    document.body.classList.toggle('touch', this.isTouch);

    this.sm = new SceneManager(canvas);
    this.input = new InputManager(canvas);
    // Touch devices and automated tests have no pointer lock.
    this.input.desktop.requireLock = !this.testMode && !this.isTouch;
    this.platform = createPlatform();
    this.analytics = new Analytics(this.bus);
    this.progression = new ProgressionTracker(this.save, this.bus);

    const scene = this.sm.scene;
    const mats = this.sm.materials;
    this.arenaRenderer = new ArenaRenderer(scene, mats);
    this.effects = new Effects(scene, mats);
    this.telegraphs = new Telegraphs(scene);
    this.pool = new EnemyPool(scene, mats, 28);
    this.damage = new DamageSystem(this.pool, this.effects, this.audio, this.bus);
    this.hits = new HitDetection(() => this.world);
    this.viewModel = new WeaponViewModel(scene, this.sm.camera, mats);
    this.weapons = new WeaponSystem(this.sm.camera, this.viewModel, this.hits, this.damage, this.pool, this.effects, this.audio, this.bus, this.sm.muzzleLight);
    this.grenades = new GrenadeSystem(scene, mats, this.sm.camera, this.damage, this.pool, this.audio);
    this.spawner = new EnemySpawner(this.pool, this.effects, this.audio);
    this.waves = new WaveManager(this.spawner, this.pool, this.bus);
    this.pickups = new PickupSystem(scene, mats, this.effects, this.audio, this.bus);
    this.crates = new WeaponCrates(scene, mats, this.effects);
    this.player = new PlayerController(this.sm.camera, this.bus);
    this.projectiles = new ProjectileSystem(scene, mats, this.effects, this.audio);

    this.hud = new HUD(uiRoot);
    this.menu = new MainMenu(uiRoot, this.isTouch);
    this.loadout = new LoadoutScreen(uiRoot);
    this.pauseMenu = new PauseMenu(uiRoot);
    this.results = new ResultsScreen(uiRoot);
    this.settingsPanel = new SettingsPanel(uiRoot);
    this.upgradeScreen = new UpgradeScreen(uiRoot);
    this.howToPlay = new HowToPlay(uiRoot, this.isTouch);
    this.shop = new UnlockShop(uiRoot);
    this.achievementsScreen = new AchievementsScreen(uiRoot);
    this.skinsScreen = new SkinsScreen(uiRoot);
    this.revive = new ReviveScreen(uiRoot);
    this.notifier = new Notifier(uiRoot);
    if (this.isTouch) {
      this.touch = new TouchInput(uiRoot);
      this.input.addProvider(this.touch);
    }

    this.wireUi();
    this.wireEvents();
    this.applySettings(this.save.data.settings);
  }

  private freshRun(seed: number): RunState {
    return { seed, timeSec: 0, kills: 0, score: 0, wavesCompleted: 0, deathTimer: 0, victoryTimer: 0, endless: false, modifiers: [], reviveUsed: false, bossesDefeated: 0 };
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
      if (this.state.is(AppState.Playing, AppState.MainMenu, AppState.Loadout)) this.sm.updateAdaptiveResolution(frameMs);
      this.update(dt);
      this.sm.scene.render();
    });

    const params = new URLSearchParams(location.search);
    const urlSeed = params.get('seed') ?? '';
    if (urlSeed) {
      this.pendingSeedText = urlSeed;
      this.loadout.setSeed(urlSeed);
    }
    if (this.testMode && params.has('autostart')) void this.startRun(urlSeed);
  }

  private wireUi(): void {
    const click = () => this.audio.play('click');
    this.menu.onPlay = () => {
      this.audio.unlock();
      click();
      this.openLoadout();
    };
    this.menu.onSettings = () => this.openSettings();
    this.menu.onHowToPlay = () => this.openHowToPlay();
    this.menu.onUpgrades = () => {
      click();
      this.openShop();
    };
    this.menu.onAchievements = () => {
      click();
      this.achievementsScreen.show(this.progression.achievements.all(), (id) => this.progression.skinForAchievement(id));
    };
    this.menu.onSkins = () => {
      click();
      this.openSkins();
    };
    this.shop.onBuy = (id, cost) => {
      if (this.progression.purchase(id, cost)) {
        this.audio.play('upgrade');
        this.notifier.show('UNLOCKED', UNLOCKS.find((u) => u.id === id)?.name ?? id, 'unlock', 3);
      }
      this.openShop();
      this.menu.show(this.save.data.records, this.save.data.scrap);
    };
    this.skinsScreen.onEquip = (id) => {
      if (this.progression.equipSkin(id)) this.audio.play('click');
      this.openSkins();
    };
    for (const m of [this.shop, this.achievementsScreen, this.skinsScreen]) {
      m.onClose = () => {
        m.close();
        click();
      };
    }

    // Loadout
    const lo = () => this.save.data.loadout;
    this.loadout.onFamily = (f) => {
      lo().family = f;
      this.persistLoadout();
    };
    this.loadout.onReroll = () => {
      lo().weaponSeed = randomSeed();
      this.audio.play('crate');
      this.persistLoadout();
    };
    this.loadout.onSkin = (id) => {
      this.progression.equipSkin(id);
      this.persistLoadout();
    };
    this.loadout.onMode = (m) => {
      lo().mode = m;
      this.persistLoadout();
    };
    this.loadout.onModifier = (id, on) => {
      lo().modifiers = on ? [...new Set([...lo().modifiers, id])] : lo().modifiers.filter((x) => x !== id);
      this.persistLoadout();
    };
    this.loadout.onStart = (seedText) => {
      this.audio.unlock();
      click();
      void this.startRun(seedText);
    };
    this.loadout.onBack = () => {
      click();
      this.showMenu();
    };

    this.pauseMenu.onResume = () => this.resume();
    this.pauseMenu.onSettings = () => this.openSettings();
    this.pauseMenu.onHowToPlay = () => this.openHowToPlay();
    this.pauseMenu.onQuit = () => this.quitToMenu();
    this.howToPlay.onClose = () => {
      this.howToPlay.close();
      click();
    };
    this.results.onRetry = () => {
      click();
      this.bus.emit('run:retry', { seed: this.run.seed });
      void this.startRun('');
    };
    this.results.onMenu = () => this.quitToMenu();
    this.upgradeScreen.onChoose = (id) => void this.chooseUpgrade(id);
    this.waves.onRewardPhase = (wave) => this.onWaveCleared(wave);
    this.hud.onPauseClick = () => this.pause();
    this.settingsPanel.onChange = (patch) => {
      this.save.updateSettings(patch);
      this.applySettings(this.save.data.settings);
    };
    this.settingsPanel.onClose = () => {
      this.settingsPanel.close();
      click();
    };
    this.revive.onRevive = () => void this.tryRevive();
    this.revive.onDecline = () => {
      this.revive.hide();
      this.finishRun(false, true);
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
      this.run.score += e.reward + (e.headshot ? 5 : 0);
      if (e.elite && e.archetype !== 'boss' && this.world) {
        // Elites always drop a weapon crate.
        this.crates.spawn(this.rollCrateWeapon(true), e.position.x, this.world.heightAtWorld(e.position.x, e.position.z), e.position.z);
        this.audio.play('crate');
      }
      if (e.archetype === 'boss') this.onBossDefeated();
    });
    bus.on('player:damaged', (e) => this.hud.damaged(e.fromX, e.fromZ, e.amount));
    bus.on('wave:started', (e) => {
      this.audio.play('waveStart');
      this.player.lastStandCharges = this.upgrades.modifiers.lastStandPerWave;
      this.regenTimer = 0;
      const w = this.waves;
      const parts = [`${e.totalEnemies} enemies`];
      if (w.shootersThisWave) parts.push(`${w.shootersThisWave} shooters`);
      if (w.tanksThisWave) parts.push(`${w.tanksThisWave} tanks`);
      if (w.elitesThisWave) parts.push(`${w.elitesThisWave} elite${w.elitesThisWave > 1 ? 's' : ''}`);
      if (e.wave > 1 && !w.bossWave) this.hud.toast(parts.join(' · '), 2.2);
    });
    bus.on('player:dashed', () => {
      this.audio.play('dash');
      if (this.synergy.has('phantomStep')) this.weapons.refillMagazine(0.25);
    });
    bus.on('player:lastStand', () => {
      this.audio.play('lastStand');
      this.hud.toast('LAST STAND!', 1.6);
    });
    bus.on('explosion', (e) => {
      const d = Math.hypot(e.x - this.player.body.x, e.z - this.player.body.z);
      if (d < 12) this.player.addTrauma(0.25 * (1 - d / 12));
    });
    bus.on('boss:phase', (e) => this.hud.showBanner(`PHASE ${e.phase}`, e.phase === 3 ? 'The Colossus is enraged' : 'It summons reinforcements', 2.2, 'bad'));
    bus.on('pickup:collected', (e) => this.hud.toast(e.kind === 'health' ? `+${Math.round(e.amount)} HEALTH` : `+${e.amount} AMMO`, 1.2));
    bus.on('achievement:unlocked', (e) => {
      this.audio.play('achievement');
      const skin = this.progression.skinForAchievement(e.id);
      this.notifier.show('ACHIEVEMENT UNLOCKED', `${e.name} · +${e.scrap} Scrap${skin ? ` · ${skin.name} skin` : ''}`, 'achievement');
    });
  }

  private applySettings(s: Settings): void {
    this.input.setSensitivity(s.mouseSensitivity, s.invertY);
    if (this.touch) this.touch.sensitivity = s.touchSensitivity;
    this.audio.setVolume(s.volume);
    this.player.shakeScale = s.cameraShake;
    this.player.headBob = s.headBob;
    this.viewModel.reduceFlashing = s.reduceFlashing;
    const root = document.documentElement.style;
    root.setProperty('--hud-scale', String(s.hudScale));
    root.setProperty('--crosshair', CROSSHAIR_COLORS[s.crosshairColor] ?? '#ffffff');
    root.setProperty('--touch-scale', String(s.buttonScale));
    if (this.sm.qualityLevel !== s.quality || !this.qualityApplied) {
      this.sm.setQuality(s.quality);
      this.effects.density = QUALITY_PRESETS[s.quality].particleScale;
      this.qualityApplied = true;
    }
  }

  private openSettings(): void {
    this.audio.play('click');
    this.settingsPanel.open(this.save.data.settings, this.isTouch);
  }

  private openHowToPlay(): void {
    this.audio.play('click');
    this.howToPlay.open();
  }

  private openShop(): void {
    this.shop.show(this.save.data.scrap, (id) => this.progression.unlocks.has(id));
  }

  private openSkins(): void {
    this.skinsScreen.show(
      this.save.data.equippedSkin,
      (s) => this.progression.skinUnlocked(s),
      (s) => (s.achievement ? this.progression.achievements.status(s.achievement) : null),
    );
  }

  private get equippedSkin(): SkinDef {
    const skin = skinFor(this.save.data.equippedSkin);
    return this.progression.skinUnlocked(skin) ? skin : SKINS.default!;
  }

  // ------------------------------------------------------------------ arena

  private loadArena(seed: number): void {
    // Each seed picks its own theme from the unlocked pool; `?theme=` can force one for testing.
    const requested = new URLSearchParams(location.search).get('theme');
    const themeId = THEME_IDS.includes(requested as ThemeId) ? (requested as ThemeId) : undefined;
    const data = generateArena(seed, { ...ARENA_OPTIONS, themeId, themePool: this.progression.unlocks.themePool() });
    this.arena = data;
    this.theme = THEMES[data.themeId];
    this.sm.applyTheme(this.theme);
    this.arenaRenderer.build(data, this.theme);
    this.world = new VoxelWorld(data);
    this.nav = new NavGrid(data);
    this.nav.compute(data.playerStart.x, data.playerStart.z);
    this.effects.setWorld(this.world);
    this.effects.clear();
    this.telegraphs.clear();
    this.hud.minimap.setArena(data, this.theme);
  }

  // ------------------------------------------------------------------ menus

  private enterMenu(): void {
    this.cleanupRun();
    // A fresh procedural arena behind the menu previews the variety on offer.
    this.loadArena(randomSeed());
    this.menu.setBackdropArena(`${this.theme.name} · ${seedToCode(this.arena!.seed)}`);
    this.showMenu();
  }

  private cleanupRun(): void {
    this.platform.gameplayStop();
    this.input.desktop.setEnabled(false);
    this.input.desktop.exitLock();
    this.touch?.setActive(false);
    this.waves.stop();
    this.pool.releaseAll();
    this.pickups.clear();
    this.crates.clear();
    this.projectiles.clear();
    this.telegraphs.clear();
    this.upgradeScreen.hide();
    this.revive.hide();
    this.hud.hide();
    this.hud.setBoss(null);
    this.pauseMenu.hide();
    this.results.hide();
    this.boss = null;
  }

  private showMenu(): void {
    this.state.set(AppState.MainMenu);
    this.loadout.hide();
    this.viewModel.setInspect(false);
    this.viewModel.setVisible(false);
    this.menu.show(this.save.data.records, this.save.data.scrap);
  }

  private openLoadout(): void {
    const lo = this.save.data.loadout;
    if (!this.progression.unlocks.familyUnlocked(lo.family)) lo.family = 'rifle';
    lo.modifiers = lo.modifiers.filter((m) => this.progression.unlocks.has(m));
    if (lo.mode === 'endless' && !this.progression.unlocks.has('mode_endless')) lo.mode = 'standard';
    this.state.set(AppState.Loadout);
    this.menu.hide();
    this.viewModel.setVisible(true);
    this.viewModel.setInspect(true);
    if (this.pendingSeedText) this.loadout.setSeed(this.pendingSeedText);
    this.renderLoadout(true);
  }

  private persistLoadout(): void {
    this.save.save();
    this.renderLoadout(false);
  }

  private renderLoadout(show: boolean): void {
    const lo = this.save.data.loadout;
    const family = lo.family as WeaponFamily;
    const weapon = createWeapon(family, new SeededRandom(lo.weaponSeed), { modules: this.progression.unlocks.modulePool() });
    this.weapons.preview(weapon, this.equippedSkin);
    this.viewModel.setInspect(true);
    const unlocks = this.progression.unlocks;
    const view = {
      family,
      weapon,
      familyUnlocked: (f: WeaponFamily) => unlocks.familyUnlocked(f),
      familyCost: (f: WeaponFamily) => UNLOCKS.find((u) => u.id === `weapon_${f}`)?.cost ?? 0,
      skinId: this.equippedSkin.id,
      skinUnlocked: (s: SkinDef) => this.progression.skinUnlocked(s),
      mode: lo.mode,
      endlessUnlocked: unlocks.has('mode_endless'),
      modifiers: lo.modifiers,
      modifierUnlocked: (id: string) => unlocks.has(id),
      scrap: this.save.data.scrap,
    };
    if (show) this.loadout.show(view);
    else this.loadout.render(view);
  }

  // ------------------------------------------------------------------ run lifecycle

  private async startRun(seedText: string): Promise<void> {
    if (this.state.is(AppState.AdBreak)) return;
    // Request pointer lock synchronously inside the click gesture (desktop only).
    const lockPromise = this.needsLock ? this.input.desktop.requestLock() : Promise.resolve(true);

    this.menu.hide();
    this.loadout.hide();
    this.results.hide();
    this.pauseMenu.hide();
    this.viewModel.setInspect(false);

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
    this.cleanupRun();

    const trimmed = seedText.trim();
    const seed = trimmed ? codeToSeed(trimmed) : randomSeed();
    this.pendingSeedText = '';
    this.loadArena(seed);
    const data = this.arena!;
    const world = this.world!;
    const lo = this.save.data.loadout;
    const unlocks = this.progression.unlocks;

    this.run = this.freshRun(seed);
    this.run.endless = lo.mode === 'endless' && unlocks.has('mode_endless');
    this.run.modifiers = lo.modifiers.filter((m) => unlocks.has(m));
    const mods = this.run.modifiers;
    const c = data.size / 2;
    // Every theme opens framed on the tallest gatehouse.
    this.player.spawn(world, data.playerStart.x + 0.5, data.playerStart.z + 0.5, Math.atan2(data.size * 0.36 - c, data.size - c));

    const family: WeaponFamily = unlocks.familyUnlocked(lo.family) ? (lo.family as WeaponFamily) : 'rifle';
    const weapon = createWeapon(family, new SeededRandom(lo.weaponSeed), { modules: unlocks.modulePool() });
    this.weapons.equip(weapon, this.equippedSkin);
    this.viewModel.setVisible(true);
    this.weaponSig = '';
    this.hud.resetRun(this.player.maxHealth);

    this.damage.resetRun();
    this.upgrades.reset();
    this.synergy.reset();
    const rng = new SeededRandom(seed);
    this.upgradeRng = rng.fork('upgrades');
    this.lootRng = rng.fork('loot');
    if (unlocks.has('ability_dash')) this.upgrades.choose('dashCharge');
    this.applyUpgrades(null);
    // Challenge modifiers.
    if (mods.includes('mod_glass')) this.damage.dealtMultiplier = 1.5;
    this.pickups.allowHealth = !mods.includes('mod_ironman');
    this.grenades.unlocked = unlocks.has('ability_grenade');
    this.grenades.bind(world);
    this.refreshBuildHud();
    this.rewardDelay = 0;
    this.regenTimer = 0;
    this.projectiles.bind(world, this.player);
    this.spawner.setArena(data, world, seed);
    const aiCtx = {
      world,
      nav: this.nav!,
      player: this.player,
      audio: this.audio,
      projectiles: this.projectiles,
      effects: this.effects,
      telegraphs: this.telegraphs,
      bus: this.bus,
      spawnMinion: (id: ArchetypeId, x: number, z: number) => {
        // Cap total enemies so boss summons never flood weaker devices.
        if (this.pool.aliveCount >= 22) return;
        this.spawner.spawnAt(id, x, z, this.player.body.x, this.player.body.z, { healthScale: 1.2, speedScale: 1.05 });
      },
      relocate: (e: Enemy) => this.spawner.relocate(e, this.player.body.x, this.player.body.z, this.player.eyeY),
    };
    if (!this.ai) this.ai = new EnemyAI(this.pool, aiCtx);
    else this.ai.setContext(aiCtx);
    this.pickups.bind(data, world, this.player, this.weapons, rng.fork('pickups'));
    this.waves.start(seed, mods.includes('mod_swarm') ? 1.5 : 1);
    this.progression.startRun();

    this.hud.show();
    this.state.set(AppState.Playing);
    this.bus.emit('run:started', { seed, theme: data.themeId, weapon: weapon.name });

    const locked = await lockPromise;
    if (locked || !this.needsLock) {
      this.input.desktop.setEnabled(true);
      this.touch?.setActive(true);
      this.platform.gameplayStart();
    } else {
      // Lock was refused (or an ad consumed the gesture): wait for one more click.
      this.pause('Click RESUME to start');
    }
  }

  private get needsLock(): boolean {
    return !this.testMode && !this.isTouch;
  }

  /** Weapon for a crate: any family, seeded from the run, modules from unlocks (elites force one). */
  private rollCrateWeapon(elite: boolean): WeaponDefinition {
    const family = this.lootRng.pick(WEAPON_FAMILIES);
    const modules = this.progression.unlocks.modulePool();
    return createWeapon(family, this.lootRng, { modules, ...(elite && modules.length ? { module: this.lootRng.pick(modules) } : {}) });
  }

  private onWaveCleared(wave: number): void {
    this.run.wavesCompleted = wave;
    this.run.score += 50 * wave;
    this.audio.play('waveClear');
    this.pickups.placeMapPickups();
    // Small resupply so a cleared wave never leaves the player stranded without ammo.
    this.weapons.addAmmo(1);
    const crateWave = this.run.endless && wave > FINAL_WAVE ? wave % 2 === 0 : CRATE_WAVES.has(wave);
    if (crateWave && this.arena && this.world) {
      const pts = this.arena.pickupPoints;
      const p = pts[(wave * 3) % pts.length];
      if (p) {
        this.crates.spawn(this.rollCrateWeapon(false), p.x + 0.5, this.world.heightAtWorld(p.x + 0.5, p.z + 0.5), p.z + 0.5);
        this.hud.toast('WEAPON CRATE DROPPED — CHECK THE MINIMAP', 2.4);
      }
    }
    if (this.waves.bossWave && !this.run.endless && wave >= FINAL_WAVE) {
      // Victory: the final boss is down.
      this.run.victoryTimer = 3;
      this.hud.showBanner('ARENA CHAMPION', 'The Obsidian Colossus has fallen', 3, 'good');
      return;
    }
    this.rewardDelay = 1.6;
  }

  private onBossDefeated(): void {
    this.run.bossesDefeated++;
    this.boss = null;
    this.hud.setBoss(null);
    this.player.addTrauma(0.8);
    // Remaining summons crumble with their master.
    for (const e of [...this.pool.active]) {
      if (e.alive) this.damage.damageEnemy(e, { amount: 99999, headshot: false, critical: false, x: e.body.x, y: e.centerY, z: e.body.z, dirX: 0, dirZ: 0, knockback: 0, weaponFamily: 'boss' });
    }
  }

  private pause(info?: string): void {
    if (!this.state.is(AppState.Playing)) return;
    this.state.set(AppState.Paused);
    this.platform.gameplayStop();
    this.input.desktop.setEnabled(false);
    this.input.reset();
    this.touch?.setActive(false);
    this.input.desktop.exitLock();
    this.hud.hideBanner();
    this.pauseMenu.show({
      wave: this.waves.wave,
      timeSec: this.run.timeSec,
      kills: this.run.kills,
      score: this.run.score,
      arena: `${this.theme.name} · Seed ${seedToCode(this.run.seed)}${this.run.endless ? ' · Endless' : ''}`,
      build: this.upgrades.owned,
      message: info,
    });
  }

  private async resume(): Promise<void> {
    if (!this.state.is(AppState.Paused) || this.resumePending) return;
    this.audio.unlock();
    this.audio.play('click');
    this.resumePending = true;
    const ok = this.needsLock ? await this.input.desktop.requestLock() : true;
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
    this.touch?.setActive(true);
    this.platform.gameplayStart();
  }

  private quitToMenu(): void {
    this.audio.play('click');
    if (this.state.is(AppState.Playing, AppState.Paused, AppState.Upgrade, AppState.Revive) && this.run.timeSec > 1) this.finishRun(false, false);
    this.enterMenu();
  }

  // ------------------------------------------------------------------ upgrades & mutations

  private openUpgradeScreen(): void {
    const stacksOf = (id: UpgradeId) => this.upgrades.stacksOf(id);
    const offered = this.upgrades.offer(this.upgradeRng, 3, (id) => this.synergy.synergyWeight(id, stacksOf));
    if (offered.length === 0) {
      this.waves.completeReward();
      return;
    }
    this.state.set(AppState.Upgrade);
    this.platform.gameplayStop();
    this.input.desktop.setEnabled(false);
    this.input.reset();
    this.touch?.setActive(false);
    this.input.desktop.exitLock();
    this.hud.hideBanner();
    this.bus.emit('upgrade:offered', { wave: this.waves.wave, ids: offered.map((d) => d.id) });
    this.upgradeScreen.show(this.waves.wave, offered, stacksOf, this.upgrades.owned);
  }

  private async chooseUpgrade(id: UpgradeId): Promise<void> {
    if (!this.state.is(AppState.Upgrade)) return;
    // Re-capture the mouse inside the click/keypress gesture that picked the card.
    const lockPromise = this.needsLock ? this.input.desktop.requestLock() : Promise.resolve(true);
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
    this.hud.toast(`${def.name.toUpperCase()}${stacks > 1 ? ` x${stacks}` : ''} ACQUIRED`, 1.8);
    this.upgradeScreen.hide();
    this.waves.completeReward();
    this.state.set(AppState.Playing);

    const locked = await lockPromise;
    if (!this.state.is(AppState.Playing)) return;
    if (locked || !this.needsLock) {
      this.input.desktop.setEnabled(true);
      this.touch?.setActive(true);
      this.platform.gameplayStart();
    } else {
      this.pause('Click RESUME to continue');
    }
  }

  /** Pushes the run's aggregate upgrade modifiers and mutations into every affected system. */
  private applyUpgrades(justTaken: UpgradeId | null): void {
    const m = this.upgrades.modifiers;
    for (const fresh of this.synergy.evaluate((id) => this.upgrades.stacksOf(id))) {
      this.notifier.show('MUTATION UNLOCKED', `${fresh.name} — ${fresh.description}`, 'mutation', 5);
      this.bus.emit('mutation:activated', { id: fresh.id, name: fresh.name });
    }
    this.weapons.applyModifiers(m);
    this.weapons.setMutations({ volatile: this.synergy.has('volatileRounds'), deadeye: this.synergy.has('deadeye') });
    this.player.speedMultiplier = Math.min(MODIFIER_CAPS.moveMul, m.moveMul);
    this.player.setMaxHealth(CONFIG.player.maxHealth + m.maxHealthAdd);
    this.player.dashUnlocked = m.dash;
    this.player.dashCooldownMul = this.synergy.has('phantomStep') ? 0.6 : 1;
    const glass = this.run.modifiers.includes('mod_glass') ? 1.5 : 1;
    this.player.damageTakenMul = glass * (this.synergy.has('juggernaut') ? 0.85 : 1);
    this.damage.explosiveLevel = m.explosiveLevel;
    if (justTaken === 'reinforcedArmor') this.player.heal(20);
    if (justTaken === 'lastStand') this.player.lastStandCharges = m.lastStandPerWave;
    this.refreshBuildHud();
  }

  private refreshBuildHud(): void {
    this.hud.setBuild(this.upgrades.owned, this.player.dashUnlocked, this.grenades.unlocked, this.synergy.list);
  }

  // ------------------------------------------------------------------ death, revive, results

  private onPlayerDeath(): void {
    this.run.deathTimer = 1.4;
    this.audio.play('death');
    this.bus.emit('player:died', { wave: this.waves.wave });
    this.platform.gameplayStop();
    this.input.desktop.setEnabled(false);
    this.touch?.setActive(false);
    this.viewModel.setVisible(false);
  }

  /** After the death camera: offer the one-per-run rewarded revive, else show results. */
  private afterDeathCamera(): void {
    if (!this.run.reviveUsed) {
      this.state.set(AppState.Revive);
      this.input.desktop.exitLock();
      this.revive.show(7);
    } else {
      this.finishRun(false, true);
    }
  }

  private async tryRevive(): Promise<void> {
    if (!this.state.is(AppState.Revive)) return;
    // Pointer lock must be requested inside the click gesture, before the ad.
    const lockPromise = this.needsLock ? this.input.desktop.requestLock() : Promise.resolve(true);
    this.state.set(AppState.AdBreak);
    const success = await this.platform.rewardedBreak(() => {
      this.audio.setMuted(true);
      this.input.desktop.exitLock();
    });
    this.audio.setMuted(false);
    if (!success) {
      // No reward unless the ad was actually completed.
      this.state.set(AppState.Revive);
      this.revive.setStatus('The ad could not be completed, so no revive was granted.');
      return;
    }
    this.run.reviveUsed = true;
    this.progression.revivedThisRun = true;
    this.revive.hide();
    this.player.revive(0.5);
    this.bus.emit('player:revived', {});
    // Shockwave clears breathing room around the player.
    this.damage.detonate(this.player.body.x, this.player.body.y + 1, this.player.body.z, 6, 30);
    this.viewModel.setVisible(true);
    this.run.deathTimer = 0;
    this.hud.show();
    this.state.set(AppState.Playing);
    const locked = await lockPromise;
    if (this.needsLock && !locked && !this.input.desktop.isLocked) {
      this.pause('Click RESUME to continue');
      return;
    }
    this.input.desktop.setEnabled(true);
    this.touch?.setActive(true);
    this.platform.gameplayStart();
  }

  private finishRun(victory: boolean, showResults: boolean): void {
    const r = this.run;
    const ws = this.weapons.runStats;
    const wave = this.waves.wave;
    const won = victory || r.bossesDefeated > 0;
    const outcome = this.save.recordRun({ wave, kills: r.kills, headshots: ws.headshots, timeSec: r.timeSec, score: r.score, seed: r.seed, victory: won });
    this.progression.recordArenas();
    const completed = victory ? FINAL_WAVE : r.wavesCompleted;
    const scrap = scrapForRun(completed, r.kills, won, r.modifiers);
    const baseScrap = scrapForRun(completed, r.kills, won);
    this.save.data.scrap += scrap;
    this.save.save();
    this.bus.emit('run:ended', { victory: won, wave, kills: r.kills, timeSec: r.timeSec, seed: r.seed });
    this.waves.stop();
    this.touch?.setActive(false);
    if (!showResults) return;
    this.state.set(AppState.GameOver);
    this.input.desktop.exitLock();
    this.hud.hide();
    const bonus = scrap > baseScrap ? ` · challenges +${scrap - baseScrap}` : '';
    this.results.show({
      victory: won,
      wave,
      wavesCompleted: r.wavesCompleted,
      kills: r.kills,
      timeSec: r.timeSec,
      score: r.score,
      accuracy: ws.shotsFired > 0 ? ws.shotsHit / ws.shotsFired : 0,
      headshots: ws.headshots,
      weaponName: this.weapons.displayName,
      seedCode: seedToCode(r.seed),
      themeName: this.theme.name,
      newBestWave: outcome.newBestWave,
      newHighScore: outcome.newHighScore,
      bestWave: this.save.data.records.bestWave,
      build: this.upgrades.owned,
      mutations: this.synergy.list.map((m) => m.name),
      scrapEarned: scrap,
      scrapBreakdown: `5 base + ${3 * completed} waves + ${Math.floor(r.kills / 20)} kills${won ? ' + 15 victory' : ''}${bonus}`,
      scrapTotal: this.save.data.scrap,
      achievementsUnlocked: [...this.progression.unlockedThisRun],
      nearest: this.progression.achievements.nearest(2),
      challenge: this.nextChallenge(won, wave),
      endless: r.endless,
    });
  }

  private nextChallenge(victory: boolean, wave: number): string {
    const unlocks = this.progression.unlocks;
    if (victory) {
      const mod = UNLOCKS.find((u) => u.category === 'modifier' && unlocks.has(u.id) && !this.run.modifiers.includes(u.id));
      if (mod) return `Next challenge: beat the Colossus with ${mod.name} for more Scrap.`;
      if (unlocks.has('mode_endless') && !this.run.endless) return 'Next challenge: Endless mode is unlocked — how far can you go?';
      return 'Next challenge: win without being revived for Golden Survivor.';
    }
    const best = this.save.data.records.bestWave;
    if (wave < best) return `Next goal: beat your best of wave ${best}.`;
    if (!this.synergy.list.length) return 'Tip: pair Rapid Fire with Explosive Kills to mutate Volatile Rounds.';
    return `Next goal: reach wave ${wave + 1}.`;
  }

  // ------------------------------------------------------------------ frame update

  private update(dt: number): void {
    this.fpsSmoothed = lerp(this.fpsSmoothed, 1 / Math.max(1e-3, this.sm.engine.getDeltaTime() / 1000), 0.05);
    switch (this.state.state) {
      case AppState.MainMenu:
      case AppState.Loadout:
        this.updateMenuCamera(dt);
        if (this.state.is(AppState.Loadout)) this.viewModel.update({ dt, lookYaw: 0, lookPitch: 0, moveAmount: 0, grounded: true, sprinting: false, ads: 0, reload: -1 });
        this.effects.update(dt);
        break;
      case AppState.Playing:
        this.updatePlaying(dt);
        break;
      case AppState.Revive:
        this.revive.update(dt);
        this.effects.update(dt);
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
      // Death camera: slump to the floor, then the revive offer / results.
      this.run.deathTimer -= dt;
      const cam = this.sm.camera;
      cam.position.y = lerp(cam.position.y, player.body.y + 0.35, dt * 3);
      cam.rotation.z = lerp(cam.rotation.z, 0.6, dt * 2.5);
      cam.rotation.x = lerp(cam.rotation.x, -0.25, dt * 2);
      this.ai?.update(dt);
      this.projectiles.update(dt);
      this.telegraphs.update(dt);
      this.effects.update(dt);
      if (this.run.deathTimer <= 0) this.afterDeathCamera();
      return;
    }

    if (this.run.victoryTimer > 0) {
      this.run.victoryTimer -= dt;
      this.effects.update(dt);
      if (this.run.victoryTimer <= 0) this.finishRun(true, true);
      return;
    }

    // Touch: light aim assist and optional auto-fire.
    if (this.touch && this.world) {
      this.aimAssist.update(dt, player, this.pool.active, this.world, settings.aimAssist);
      if (settings.autoFire && this.aimAssist.onTarget) input.fire = true;
    }

    this.run.timeSec += dt;
    const ads = this.weapons.ads;
    player.update(dt, input, input.aim, ads > 0.5 ? 0.75 : 1);
    this.weapons.update(dt, input, player, player.alive);
    if (input.grenadePressed) this.grenades.tryThrow();
    this.ai?.update(dt);
    this.projectiles.update(dt);
    this.grenades.update(dt);
    this.damage.update();
    this.waves.update(dt, player);
    this.pickups.update(dt);
    this.telegraphs.update(dt);
    this.effects.update(dt);

    // Weapon crates: prompt + pick up.
    const crate = this.crates.update(dt, player);
    this.hud.setPrompt(crate, !!this.touch);
    if (crate && input.interactPressed) {
      const def = this.crates.take();
      if (def) {
        const dropped = this.weapons.addWeapon(def);
        this.audio.play('crate');
        this.hud.toast(dropped ? `SWAPPED ${dropped.name.toUpperCase()} FOR ${def.name.toUpperCase()}` : `${def.name.toUpperCase()} EQUIPPED`, 2);
        this.bus.emit('weapon:pickedUp', { name: def.name, family: def.family, tier: def.tier });
      }
    }
    const sig = `${this.weapons.current}:${this.weapons.slots.map((s) => s.def.id).join('|')}:${this.weapons.displayName}`;
    if (sig !== this.weaponSig) {
      this.weaponSig = sig;
      this.hud.setWeapons(this.weapons.slots, this.weapons.current, this.equippedSkin, this.weapons.displayName);
    }

    // Boss tracking.
    if (!this.boss || !this.boss.alive || this.boss.archetype.id !== 'boss') this.boss = this.pool.active.find((e) => e.alive && e.archetype.id === 'boss') ?? null;
    if (this.boss) this.hud.setBoss(ARCHETYPES.boss.displayName, this.boss.health / this.boss.maxHealth, this.boss.phase);
    else this.hud.setBoss(null);

    // Regeneration ticks only while a wave is actually being fought (never in Iron Man).
    const regen = this.upgrades.modifiers.regenPer10s * (this.synergy.has('juggernaut') ? 2 : 1);
    if (regen > 0 && this.pickups.allowHealth && player.alive && (this.waves.phase === WavePhase.Spawning || this.waves.phase === WavePhase.Combat)) {
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

    // ADS zoom (per-sight), plus a short FOV kick while dashing.
    this.sm.setFov(settings.fov * (1 - this.weapons.stats.adsZoom * ads) * (player.dashTime > 0 ? 1.08 : 1));

    if (!player.alive) {
      this.onPlayerDeath();
      return;
    }

    if (this.touch) {
      this.touch.setAvailable({ dash: player.dashUnlocked, grenade: this.grenades.unlocked, take: !!crate, swap: this.weapons.slots.length > 1 });
      this.touch.setCooldowns(player.dashCooldown01, this.grenades.cooldown01);
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
      killedThisWave: Math.min(w.killedThisWave, w.totalThisWave),
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
      grenadeCooldown: this.grenades.unlocked ? this.grenades.cooldown01 : undefined,
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
    this.crates.forEachActive((x, z) => pickups.push({ x, z, kind: 'crate' }));
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
        `weapon ${this.weapons.def.id}`,
        `build ${this.upgrades.owned.map((o) => `${o.def.id}${o.stacks > 1 ? 'x' + o.stacks : ''}`).join(' ') || '-'}  mutations ${this.synergy.list.map((m) => m.id).join(' ') || '-'}`,
        `mode ${this.run.endless ? 'endless' : 'standard'}  modifiers ${this.run.modifiers.join(' ') || '-'}  scrap ${this.save.data.scrap}`,
      ].join('\n'),
    );
  }
}
