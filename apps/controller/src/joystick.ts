import type { Axis } from '@party/contract';

const DEADZONE = 0.08;

export interface Joystick {
  el: HTMLElement;
  onChange(cb: (axis: Axis) => void): () => void;
  /** Force release (e.g. when the page is hidden). */
  reset(): void;
  destroy(): void;
}

/**
 * Virtual analog stick. x right, y DOWN, |v| <= 1. Only the pointer that
 * started on the stick drives it, so other fingers can press buttons.
 */
export function createJoystick(): Joystick {
  const base = document.createElement('div');
  base.className = 'stick';
  const knob = document.createElement('div');
  knob.className = 'stick-knob';
  base.appendChild(knob);

  const cbs = new Set<(a: Axis) => void>();
  let owner: number | null = null;
  let cx = 0;
  let cy = 0;
  let radius = 1;
  let axis: Axis = { x: 0, y: 0 };

  const emit = (next: Axis) => {
    if (next.x === axis.x && next.y === axis.y) return;
    axis = next;
    cbs.forEach((cb) => cb(axis));
  };

  const place = (dx: number, dy: number) => {
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  };

  const update = (clientX: number, clientY: number) => {
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > radius) {
      dx = (dx / dist) * radius;
      dy = (dy / dist) * radius;
    }
    place(dx, dy);
    let x = dx / radius;
    let y = dy / radius;
    const mag = Math.hypot(x, y);
    if (mag < DEADZONE) {
      x = 0;
      y = 0;
    } else if (mag > 1) {
      x /= mag;
      y /= mag;
    }
    const r = (v: number) => {
      const n = Math.round(v * 1000) / 1000;
      return Math.max(-1, Math.min(1, n === 0 ? 0 : n)); // avoid -0
    };
    emit({ x: r(x), y: r(y) });
  };

  const release = () => {
    owner = null;
    base.classList.remove('active');
    place(0, 0);
    emit({ x: 0, y: 0 });
  };

  const onDown = (e: PointerEvent) => {
    if (owner !== null) return;
    e.preventDefault();
    owner = e.pointerId;
    try {
      base.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const rect = base.getBoundingClientRect();
    cx = rect.left + rect.width / 2;
    cy = rect.top + rect.height / 2;
    radius = Math.max(1, rect.width / 2 - knob.offsetWidth / 4);
    base.classList.add('active');
    update(e.clientX, e.clientY);
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== owner) return;
    e.preventDefault();
    update(e.clientX, e.clientY);
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== owner) return;
    try {
      base.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    release();
  };

  base.addEventListener('pointerdown', onDown);
  base.addEventListener('pointermove', onMove);
  base.addEventListener('pointerup', onUp);
  base.addEventListener('pointercancel', onUp);
  base.addEventListener('lostpointercapture', onUp);
  base.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    el: base,
    onChange(cb) {
      cbs.add(cb);
      return () => cbs.delete(cb);
    },
    reset() {
      if (owner !== null || axis.x !== 0 || axis.y !== 0) release();
    },
    destroy() {
      cbs.clear();
      base.remove();
    },
  };
}
