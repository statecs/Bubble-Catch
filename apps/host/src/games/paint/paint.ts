/**
 * The paint layer: an offscreen canvas for the look, plus a coarse ownership grid for scoring.
 * Stamps are blobby (a cluster of overlapping circles), never clean discs.
 */
import { CFG } from './config';

export class PaintLayer {
  readonly canvas = document.createElement('canvas');
  private g = this.canvas.getContext('2d')!;
  private owner = new Uint8Array(0);
  private counts: number[] = [];
  private cols = 0;
  private rows = 0;
  private width = 0;
  private height = 0;

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    // Keep existing paint by redrawing the old bitmap scaled; ownership grid is rebuilt (approximate).
    const old = this.width ? this.canvas : null;
    let snapshot: HTMLCanvasElement | null = null;
    if (old) {
      snapshot = document.createElement('canvas');
      snapshot.width = old.width;
      snapshot.height = old.height;
      snapshot.getContext('2d')!.drawImage(old, 0, 0);
    }
    this.width = width;
    this.height = height;
    this.canvas.width = Math.max(1, Math.round(width));
    this.canvas.height = Math.max(1, Math.round(height));
    this.g = this.canvas.getContext('2d')!;
    if (snapshot) this.g.drawImage(snapshot, 0, 0, this.canvas.width, this.canvas.height);
    this.cols = Math.ceil(width / CFG.gridPx);
    this.rows = Math.ceil(height / CFG.gridPx);
    this.owner = new Uint8Array(this.cols * this.rows);
    this.counts = [];
  }

  clear(): void {
    this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.owner.fill(0);
    this.counts = [];
  }

  /** Blobby stamp. `wobble` 0..1 controls how irregular the blob is. */
  stamp(x: number, y: number, radius: number, color: string, owner: number, wobble = 0.35): void {
    const g = this.g;
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, radius * 0.82, 0, Math.PI * 2);
    g.fill();
    const lobes = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < lobes; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = radius * (0.25 + Math.random() * 0.45) * wobble * 2;
      const r = radius * (0.45 + Math.random() * 0.35);
      g.beginPath();
      g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r, 0, Math.PI * 2);
      g.fill();
    }
    this.claim(x, y, radius * 0.95, owner);
  }

  /** Thin vertical drip mark. */
  drip(x: number, y: number, length: number, width: number, color: string, owner: number): void {
    const g = this.g;
    g.fillStyle = color;
    g.beginPath();
    g.roundRect(x - width / 2, y, width, length, width / 2);
    g.fill();
    g.beginPath();
    g.arc(x, y + length, width * 0.75, 0, Math.PI * 2);
    g.fill();
    this.claim(x, y + length, width, owner);
  }

  private claim(x: number, y: number, radius: number, owner: number): void {
    const s = CFG.gridPx;
    const c0 = Math.max(0, Math.floor((x - radius) / s));
    const c1 = Math.min(this.cols - 1, Math.floor((x + radius) / s));
    const r0 = Math.max(0, Math.floor((y - radius) / s));
    const r1 = Math.min(this.rows - 1, Math.floor((y + radius) / s));
    const rr = radius * radius;
    for (let r = r0; r <= r1; r++) {
      const cy = r * s + s / 2;
      for (let c = c0; c <= c1; c++) {
        const cx = c * s + s / 2;
        if ((cx - x) ** 2 + (cy - y) ** 2 > rr) continue;
        const i = r * this.cols + c;
        const prev = this.owner[i]!;
        if (prev === owner) continue;
        if (prev) this.counts[prev] = (this.counts[prev] ?? 1) - 1;
        this.owner[i] = owner;
        this.counts[owner] = (this.counts[owner] ?? 0) + 1;
      }
    }
  }

  /** Fraction of the floor owned by each owner index. */
  coverage(): Map<number, number> {
    const total = this.cols * this.rows || 1;
    const out = new Map<number, number>();
    this.counts.forEach((n, owner) => {
      if (owner && n > 0) out.set(owner, n / total);
    });
    return out;
  }

  ownerAt(x: number, y: number): number {
    const c = Math.floor(x / CFG.gridPx);
    const r = Math.floor(y / CFG.gridPx);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return 0;
    return this.owner[r * this.cols + c] ?? 0;
  }
}
