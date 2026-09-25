/**
 * Game picker: the first thing the host sees when no `?game=` is given, and where "Change game" in the
 * sidebar leads. The room already exists, so players can scan the QR and join while the host chooses.
 * Keys 1–N pick a card.
 */
import { GAME_CARDS } from './games';

export interface Picker {
  /** Update the "N players waiting" line. */
  setPlayerCount(n: number): void;
  destroy(): void;
}

export function renderPicker(root: HTMLElement, onPick: (id: string) => void): Picker {
  const wrap = document.createElement('div');
  wrap.className = 'picker';

  const head = document.createElement('div');
  head.className = 'picker-head';
  const title = document.createElement('h1');
  title.textContent = 'Pick a game';
  const sub = document.createElement('p');
  sub.className = 'picker-sub';
  head.append(title, sub);

  const grid = document.createElement('div');
  grid.className = 'picker-grid';
  GAME_CARDS.forEach((card, i) => {
    const b = document.createElement('button');
    b.className = 'picker-card';
    b.dataset.game = card.id;
    const img = document.createElement('img');
    img.src = card.preview;
    img.alt = '';
    const body = document.createElement('div');
    body.className = 'picker-body';
    const name = document.createElement('div');
    name.className = 'picker-name';
    name.textContent = card.name;
    const key = document.createElement('kbd');
    key.textContent = String(i + 1);
    name.append(key);
    const blurb = document.createElement('div');
    blurb.className = 'picker-blurb';
    blurb.textContent = card.blurb;
    body.append(name, blurb);
    b.append(img, body);
    b.addEventListener('click', () => onPick(card.id));
    grid.append(b);
  });

  wrap.append(head, grid);
  root.append(wrap);

  const onKey = (e: KeyboardEvent) => {
    const n = Number(e.key);
    const card = Number.isInteger(n) && n >= 1 ? GAME_CARDS[n - 1] : undefined;
    if (card) onPick(card.id);
  };
  window.addEventListener('keydown', onKey);

  const picker: Picker = {
    setPlayerCount(n) {
      sub.textContent =
        n === 0
          ? 'Players can join now: scan the QR code on the left.'
          : `${n} player${n === 1 ? '' : 's'} waiting. More can still join with the QR code on the left.`;
    },
    destroy() {
      window.removeEventListener('keydown', onKey);
      wrap.remove();
    },
  };
  picker.setPlayerCount(0);
  return picker;
}
