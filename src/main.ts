import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/700.css';
import './styles/main.css';
import { Game } from './core/Game';

const loadStart = performance.now();

function showFatal(message: string): void {
  const el = document.getElementById('loading');
  if (el) {
    el.classList.add('error');
    el.querySelector('.loading-text')!.textContent = message;
  }
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

async function boot(): Promise<void> {
  if (!hasWebGL()) {
    showFatal('WebGL is not available in this browser. Please enable hardware acceleration or try another browser.');
    return;
  }
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const ui = document.getElementById('ui')!;
  try {
    const game = new Game(canvas, ui);
    await game.start(loadStart);
    document.getElementById('loading')?.classList.add('done');
    if (import.meta.env.DEV || new URLSearchParams(location.search).has('test')) (window as unknown as { game: Game }).game = game;
  } catch (err) {
    console.error(err);
    showFatal('Something went wrong while starting the game. Please reload the page.');
  }
}

void boot();
