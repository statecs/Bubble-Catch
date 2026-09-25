import { LIMITS, type Axis, type ButtonId, type InputState } from '@party/contract';
import { createJoystick } from './joystick';

export interface Pad {
  el: HTMLElement;
  destroy(): void;
}

const INTERVAL_MS = 1000 / LIMITS.inputHz;

const same = (a: InputState, b: InputState) =>
  a.axis.x === b.axis.x && a.axis.y === b.axis.y && a.buttons.a === b.buttons.a && a.buttons.b === b.buttons.b;

const clone = (s: InputState): InputState => ({ axis: { ...s.axis }, buttons: { ...s.buttons } });

/**
 * The input surface. Sends the whole InputState, throttled to LIMITS.inputHz:
 * button edges and the final "all idle" state go out immediately, axis
 * movement at most every 1000/inputHz ms and only when changed.
 */
export function createPad(send: (input: InputState) => void): Pad {
  const root = document.createElement('div');
  root.className = 'pad';

  const left = document.createElement('div');
  left.className = 'pad-left';
  const right = document.createElement('div');
  right.className = 'pad-right';
  root.append(left, right);

  const stick = createJoystick();
  left.appendChild(stick.el);

  const state: InputState = { axis: { x: 0, y: 0 }, buttons: { a: false, b: false } };
  let lastSent: InputState = clone(state);
  let lastSentAt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (same(state, lastSent)) return;
    lastSent = clone(state);
    lastSentAt = performance.now();
    send(clone(state));
  };

  const isIdle = () => state.axis.x === 0 && state.axis.y === 0 && !state.buttons.a && !state.buttons.b;

  const schedule = () => {
    if (isIdle()) return flush(); // release: always deliver the zero state right away
    const wait = INTERVAL_MS - (performance.now() - lastSentAt);
    if (wait <= 0) return flush();
    if (!timer) timer = setTimeout(flush, wait);
  };

  stick.onChange((axis: Axis) => {
    state.axis = { ...axis };
    schedule();
  });

  const makeButton = (id: ButtonId, label: string) => {
    const btn = document.createElement('div');
    btn.className = `btn btn-${id}`;
    btn.textContent = label;
    btn.setAttribute('role', 'button');
    let owner: number | null = null;
    const set = (down: boolean) => {
      btn.classList.toggle('pressed', down);
      if (state.buttons[id] === down) return;
      state.buttons[id] = down;
      flush(); // button edges are sent immediately
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (owner !== null) return;
      owner = e.pointerId;
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      set(true);
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId !== owner) return;
      owner = null;
      set(false);
    };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    return {
      el: btn,
      reset: () => {
        owner = null;
        set(false);
      },
    };
  };

  const b = makeButton('b', 'B');
  const a = makeButton('a', 'A');
  right.append(b.el, a.el);

  const releaseAll = () => {
    stick.reset();
    a.reset();
    b.reset();
    flush();
  };
  const onVis = () => {
    if (document.visibilityState === 'hidden') releaseAll();
  };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('blur', releaseAll);

  return {
    el: root,
    destroy() {
      releaseAll();
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', releaseAll);
      stick.destroy();
      root.remove();
    },
  };
}
