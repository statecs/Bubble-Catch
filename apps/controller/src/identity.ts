const KEY_ID = 'party.playerId';
const KEY_NAME = 'party.name';
const KEY_CODE = 'party.code';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // private mode / storage disabled
  }
}
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** crypto.randomUUID only exists in secure contexts (https/localhost); phones on plain LAN http need a fallback. */
function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

let cachedId: string | null = null;

export function getPlayerId(): string {
  if (cachedId) return cachedId;
  let id = read(KEY_ID);
  if (!id || id.length < 8 || id.length > 64) {
    id = newId();
    write(KEY_ID, id);
  }
  cachedId = id;
  return id;
}

export function getSavedName(): string {
  return read(KEY_NAME) ?? '';
}
export function saveName(name: string): void {
  write(KEY_NAME, name);
}

export function getSavedCode(): string {
  return read(KEY_CODE) ?? '';
}
export function saveCode(code: string): void {
  write(KEY_CODE, code);
}
