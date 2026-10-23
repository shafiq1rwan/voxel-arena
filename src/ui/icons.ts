/**
 * UI icon set: Phosphor Icons, "fill" weight (MIT licence, https://phosphoricons.com).
 * Imported as raw SVG strings so only the icons used here are bundled — nothing is fetched at
 * runtime. Every icon uses `currentColor`, so colour is controlled from CSS.
 */
import gearSix from '@phosphor-icons/core/fill/gear-six-fill.svg?raw';
import pause from '@phosphor-icons/core/fill/pause-fill.svg?raw';
import skull from '@phosphor-icons/core/fill/skull-fill.svg?raw';
import coins from '@phosphor-icons/core/fill/coins-fill.svg?raw';
import heart from '@phosphor-icons/core/fill/heart-fill.svg?raw';
import clock from '@phosphor-icons/core/fill/clock-fill.svg?raw';
import target from '@phosphor-icons/core/fill/target-fill.svg?raw';
import castleTurret from '@phosphor-icons/core/fill/castle-turret-fill.svg?raw';
import sword from '@phosphor-icons/core/fill/sword-fill.svg?raw';
import arrowFatLinesUp from '@phosphor-icons/core/fill/arrow-fat-lines-up-fill.svg?raw';
import barbell from '@phosphor-icons/core/fill/barbell-fill.svg?raw';
import lightning from '@phosphor-icons/core/fill/lightning-fill.svg?raw';
import crosshair from '@phosphor-icons/core/fill/crosshair-fill.svg?raw';
import arrowFatLinesRight from '@phosphor-icons/core/fill/arrow-fat-lines-right-fill.svg?raw';
import stack from '@phosphor-icons/core/fill/stack-fill.svg?raw';
import arrowsClockwise from '@phosphor-icons/core/fill/arrows-clockwise-fill.svg?raw';
import sneakerMove from '@phosphor-icons/core/fill/sneaker-move-fill.svg?raw';
import caretDoubleRight from '@phosphor-icons/core/fill/caret-double-right-fill.svg?raw';
import shieldPlus from '@phosphor-icons/core/fill/shield-plus-fill.svg?raw';
import heartbeat from '@phosphor-icons/core/fill/heartbeat-fill.svg?raw';
import heartBreak from '@phosphor-icons/core/fill/heart-break-fill.svg?raw';
import bomb from '@phosphor-icons/core/fill/bomb-fill.svg?raw';
import type { UpgradeId } from '../upgrades/UpgradeTypes';

/** Marks icons as decorative; accessible names come from the surrounding button/label. */
const prep = (raw: string): string => raw.replace('<svg ', '<svg aria-hidden="true" focusable="false" ');

export const ICONS = {
  gear: prep(gearSix),
  pause: prep(pause),
  skull: prep(skull),
  coin: prep(coins),
  heart: prep(heart),
  clock: prep(clock),
  target: prep(target),
  arena: prep(castleTurret),
  waves: prep(sword),
  upgrades: prep(arrowFatLinesUp),
};

const UPGRADE_ICONS: Record<UpgradeId, string> = {
  heavyRounds: prep(barbell),
  rapidFire: prep(lightning),
  criticalPrecision: prep(crosshair),
  piercingShots: prep(arrowFatLinesRight),
  expandedMagazine: prep(stack),
  swiftReload: prep(arrowsClockwise),
  quickFeet: prep(sneakerMove),
  dashCharge: prep(caretDoubleRight),
  reinforcedArmor: prep(shieldPlus),
  regeneration: prep(heartbeat),
  lastStand: prep(heartBreak),
  explosiveKills: prep(bomb),
};

export function upgradeIcon(id: UpgradeId): string {
  return UPGRADE_ICONS[id];
}
