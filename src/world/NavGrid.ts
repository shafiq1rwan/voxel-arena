import { CellKind, STEP_HEIGHT, type ArenaData } from '../procedural/ArenaTypes';

const DIRS: readonly [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/**
 * Navigation flow field over the arena grid. A single Dijkstra pass from the player's cell gives
 * every enemy its next step in O(1), so pathfinding cost does not grow with enemy count.
 */
export class NavGrid {
  readonly size: number;
  /** Path distance (metres) to the target cell; Infinity when unreachable. */
  readonly dist: Float32Array;
  private heights: Float32Array;
  private blocked: Uint8Array;
  private heap: Int32Array;
  private heapKeys: Float32Array;
  private heapSize = 0;
  private targetCell = -1;

  constructor(data: ArenaData) {
    this.size = data.size;
    const n = this.size;
    this.heights = data.heights;
    this.dist = new Float32Array(n * n).fill(Infinity);
    this.heap = new Int32Array(n * n * 8);
    this.heapKeys = new Float32Array(n * n * 8);
    this.blocked = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) {
      // Enemies never walk on boundary or very tall structures.
      if (data.kinds[i] === CellKind.Boundary || data.heights[i]! > 2.5) this.blocked[i] = 1;
    }
  }

  get target(): number {
    return this.targetCell;
  }

  private canMove(x: number, z: number, nx: number, nz: number): boolean {
    const n = this.size;
    if (nx < 0 || nz < 0 || nx >= n || nz >= n) return false;
    const ni = nz * n + nx;
    if (this.blocked[ni]) return false;
    return Math.abs(this.heights[z * n + x]! - this.heights[ni]!) <= STEP_HEIGHT;
  }

  /** Allowed transition including diagonal corner-cutting prevention. */
  canStep(x: number, z: number, dx: number, dz: number): boolean {
    if (!this.canMove(x, z, x + dx, z + dz)) return false;
    if (dx !== 0 && dz !== 0) {
      return this.canMove(x, z, x + dx, z) && this.canMove(x, z, x, z + dz) && this.canMove(x + dx, z, x + dx, z + dz) && this.canMove(x, z + dz, x + dx, z + dz);
    }
    return true;
  }

  isWalkable(x: number, z: number): boolean {
    const n = this.size;
    return x >= 0 && z >= 0 && x < n && z < n && !this.blocked[z * n + x];
  }

  /** Recomputes the field toward cell (tx, tz). Cheap (~1.7k cells); called when the target moves cells. */
  compute(tx: number, tz: number): void {
    const n = this.size;
    tx = Math.max(0, Math.min(n - 1, tx));
    tz = Math.max(0, Math.min(n - 1, tz));
    const start = tz * n + tx;
    this.targetCell = start;
    this.dist.fill(Infinity);
    this.dist[start] = 0;
    this.heapSize = 0;
    this.push(start);
    while (this.heapSize > 0) {
      const idx = this.pop();
      if (idx < 0) continue;
      const x = idx % n;
      const z = (idx - x) / n;
      const d = this.dist[idx]!;
      for (const [dx, dz, cost] of DIRS) {
        // Reverse edge: enemies move from neighbour toward idx.
        if (!this.canStep(x + dx, z + dz, -dx, -dz)) continue;
        const ni = (z + dz) * n + (x + dx);
        const nd = d + cost;
        if (nd < this.dist[ni]!) {
          this.dist[ni] = nd;
          this.push(ni);
        }
      }
    }
  }

  /**
   * Writes the direction to steer from world position (wx, wz) along the flow field.
   * Returns false if no better neighbour exists (at target or unreachable).
   */
  direction(wx: number, wz: number, out: { x: number; z: number }): boolean {
    const n = this.size;
    const x = Math.floor(wx);
    const z = Math.floor(wz);
    if (x < 0 || z < 0 || x >= n || z >= n) return false;
    const here = this.dist[z * n + x]!;
    let best = here;
    let bx = 0;
    let bz = 0;
    for (const [dx, dz] of DIRS) {
      if (!this.canStep(x, z, dx, dz)) continue;
      const d = this.dist[(z + dz) * n + (x + dx)]!;
      if (d < best) {
        best = d;
        bx = dx;
        bz = dz;
      }
    }
    if (best >= here) return false;
    // Aim for the neighbour cell's centre so bodies stay away from corners.
    const tx = x + bx + 0.5 - wx;
    const tz = z + bz + 0.5 - wz;
    const len = Math.hypot(tx, tz) || 1;
    out.x = tx / len;
    out.z = tz / len;
    return true;
  }

  distanceAt(wx: number, wz: number): number {
    const x = Math.floor(wx);
    const z = Math.floor(wz);
    if (x < 0 || z < 0 || x >= this.size || z >= this.size) return Infinity;
    return this.dist[z * this.size + x]!;
  }

  // --- binary min-heap with stored keys; stale entries are skipped on pop ---
  private push(i: number): void {
    if (this.heapSize >= this.heap.length) return; // cannot happen with correct keys; defensive
    const heap = this.heap;
    const keys = this.heapKeys;
    let k = this.heapSize++;
    heap[k] = i;
    keys[k] = this.dist[i]!;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (keys[p]! <= keys[k]!) break;
      this.swap(p, k);
      k = p;
    }
  }

  private pop(): number {
    const heap = this.heap;
    const keys = this.heapKeys;
    const top = heap[0]!;
    const topKey = keys[0]!;
    this.heapSize--;
    heap[0] = heap[this.heapSize]!;
    keys[0] = keys[this.heapSize]!;
    let k = 0;
    for (;;) {
      const l = k * 2 + 1;
      const r = l + 1;
      let m = k;
      if (l < this.heapSize && keys[l]! < keys[m]!) m = l;
      if (r < this.heapSize && keys[r]! < keys[m]!) m = r;
      if (m === k) break;
      this.swap(m, k);
      k = m;
    }
    return topKey > this.dist[top]! ? -1 : top;
  }

  private swap(a: number, b: number): void {
    const h = this.heap;
    const k = this.heapKeys;
    const ti = h[a]!;
    h[a] = h[b]!;
    h[b] = ti;
    const tk = k[a]!;
    k[a] = k[b]!;
    k[b] = tk;
  }
}
