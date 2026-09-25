/**
 * Procedural hand-drawn animals. Each is a chalky egg-shaped body (like the cat
 * reference) with googly doodle eyes, species features and a scarf in the
 * player's accent colour. The sprite faces right; flip it to face left.
 *
 * Drawing happens in a 110x110 local space: body centre at (0, 0), feet near
 * y = +31, ear tips near y = -55.
 */
import { INK, PASTELS, mix, shade } from './palette';
import { applyGrain, blobPoints, eggPoints, inkLine, inkOutline, softDab, solidFill, watercolourFill, type Pt } from './ink';
import { hashSeed, mulberry32, type Rng } from './rng';

export type Species = 'cat' | 'bunny' | 'bear' | 'frog' | 'fox' | 'pig' | 'duck' | 'penguin';
export type AnimalPose = 'idle' | 'walkA' | 'walkB' | 'happy';

export interface AnimalSpec {
  id: Species;
  name: string;
  body: string;
  belly?: string;
}

export const ANIMALS: readonly AnimalSpec[] = [
  { id: 'cat', name: 'Cat', body: '#f6f3ee' },
  { id: 'frog', name: 'Frog', body: '#bfe6b0', belly: '#e6f6da' },
  { id: 'fox', name: 'Fox', body: '#ffbe94', belly: '#fff3e6' },
  { id: 'bunny', name: 'Bunny', body: '#e6dbf6', belly: '#f8f3fd' },
  { id: 'duck', name: 'Duck', body: '#fff0a0' },
  { id: 'pig', name: 'Pig', body: '#ffc6d3' },
  { id: 'penguin', name: 'Penguin', body: '#b3c7e3', belly: '#fbfbff' },
  { id: 'bear', name: 'Bear', body: '#e3c3a1', belly: '#f3dcc3' },
];

export function animalSpec(id: Species): AnimalSpec {
  return ANIMALS.find((a) => a.id === id) ?? ANIMALS[0]!;
}

export interface DrawAnimalOptions {
  species: Species;
  pose: AnimalPose;
  /** Scarf colour; matches the phone. */
  accent: string;
  /** Optional replacement body colour (used when a species repeats). */
  body?: string;
  /** Sprite box size in css px (square). */
  size: number;
}

/** Where the body centre and the soles of the feet sit inside the sprite box, as fractions of `size`. */
export const ANIMAL_BODY_Y = 0.6;
export const ANIMAL_FEET_Y = 0.93;

const BEAK = '#ffb36b';

/** Points along the edges of a polygon, so smoothPath keeps edges straight-ish with round corners. */
function polyPoints(corners: Pt[], perEdge = 3): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i]!;
    const b = corners[(i + 1) % corners.length]!;
    for (let k = 0; k < perEdge; k++) {
      const t = k / perEdge;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

function rotate(pts: Pt[], cx: number, cy: number, angle: number): Pt[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return pts.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
  });
}

/** Opaque fill + watercolour pooling + chalk grain + sketchy outline. */
function part(g: CanvasRenderingContext2D, pts: Pt[], colour: string, rng: Rng, width = 3, grain = 0.55): void {
  solidFill(g, pts, colour);
  watercolourFill(g, pts, colour, rng, 1.2);
  if (grain > 0) applyGrain(g, grain, pts);
  inkOutline(g, pts, rng, width);
}

function dot(g: CanvasRenderingContext2D, x: number, y: number, r: number, colour = INK): void {
  g.fillStyle = colour;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function tail(g: CanvasRenderingContext2D, sp: Species, body: string, R: (tag: string) => Rng): void {
  switch (sp) {
    case 'cat': {
      const pts = [
        { x: -20, y: 18 },
        { x: -36, y: 14 },
        { x: -44, y: 0 },
        { x: -40, y: -12 },
      ];
      inkLine(g, pts, 11);
      inkLine(g, pts, 6.5, body);
      break;
    }
    case 'fox': {
      const pts = rotate(blobPoints(-32, 12, 16, 9, R('tail'), 0.08), -32, 12, -0.55);
      part(g, pts, body, R('tail2'), 3, 0.4);
      const tip = rotate(blobPoints(-43, 4, 6, 5, R('tip'), 0.1, 10), -43, 4, -0.55);
      part(g, tip, '#fff8ef', R('tip2'), 2.4, 0);
      break;
    }
    case 'bunny':
      part(g, blobPoints(-26, 20, 8, 7.5, R('tail'), 0.12, 12), '#ffffff', R('tail2'), 2.6, 0.3);
      break;
    case 'pig':
      inkLine(g, [
        { x: -24, y: 14 },
        { x: -32, y: 10 },
        { x: -34, y: 4 },
        { x: -29, y: 2 },
        { x: -28, y: 8 },
        { x: -34, y: 12 },
      ], 2.6);
      break;
    case 'duck':
      part(g, polyPoints([{ x: -22, y: 6 }, { x: -38, y: -2 }, { x: -24, y: 18 }]), body, R('tail'), 2.8, 0.4);
      break;
    default:
      break;
  }
}

function ears(g: CanvasRenderingContext2D, sp: Species, body: string, R: (tag: string) => Rng): void {
  const inner = PASTELS.rose;
  switch (sp) {
    case 'cat':
    case 'fox': {
      const tall = sp === 'fox' ? 6 : 0;
      for (const side of [-1, 1]) {
        const o = side > 0 ? 4 : 0; // head is shifted slightly to the facing side
        const outer = polyPoints([
          { x: side * 4 + o, y: -30 },
          { x: side * 16 + o, y: -46 - tall },
          { x: side * 24 + o, y: -20 },
        ]);
        part(g, outer, body, R(`ear${side}`), 3, 0.4);
        const inn = polyPoints([
          { x: side * 9 + o, y: -29 },
          { x: side * 16 + o, y: -40 - tall },
          { x: side * 20 + o, y: -25 },
        ], 2);
        solidFill(g, inn, sp === 'fox' ? '#fff3e6' : inner);
      }
      break;
    }
    case 'bunny':
      for (const side of [-1, 1]) {
        const cx = side * 10 + 2;
        const pts = rotate(blobPoints(cx, -46, 7.5, 19, R(`ear${side}`), 0.04), cx, -30, side * 0.18);
        part(g, pts, body, R(`ear2${side}`), 3, 0.4);
        const inn = rotate(blobPoints(cx, -46, 3.5, 13, R(`in${side}`), 0.05, 12), cx, -30, side * 0.18);
        solidFill(g, inn, inner);
      }
      break;
    case 'bear':
      for (const side of [-1, 1]) {
        const cx = side * 18 + 2;
        part(g, blobPoints(cx, -26, 9.5, 9, R(`ear${side}`), 0.06, 14), body, R(`ear2${side}`), 3, 0.4);
        solidFill(g, blobPoints(cx, -26, 4.5, 4.5, R(`in${side}`), 0.08, 10), shade(body, 0.15));
      }
      break;
    case 'pig':
      for (const side of [-1, 1]) {
        const o = 2;
        part(g, polyPoints([
          { x: side * 8 + o, y: -28 },
          { x: side * 20 + o, y: -38 },
          { x: side * 22 + o, y: -22 },
        ]), shade(body, 0.06), R(`ear${side}`), 2.8, 0.3);
      }
      break;
    default:
      break;
  }
}

function feet(g: CanvasRenderingContext2D, sp: Species, body: string, pose: AnimalPose, R: (tag: string) => Rng): void {
  const colour = sp === 'duck' || sp === 'penguin' ? BEAK : shade(body, 0.08);
  const lift = { l: 0, r: 0, lx: 0, rx: 0 };
  if (pose === 'walkA') Object.assign(lift, { l: -5, lx: 4, rx: -2 });
  if (pose === 'walkB') Object.assign(lift, { r: -5, rx: 4, lx: -2 });
  part(g, blobPoints(-11 + lift.lx, 31 + lift.l, 9, 5.5, R('footL'), 0.06, 12), colour, R('footL2'), 2.8, 0.3);
  part(g, blobPoints(13 + lift.rx, 31 + lift.r, 9, 5.5, R('footR'), 0.06, 12), colour, R('footR2'), 2.8, 0.3);
}

function arms(g: CanvasRenderingContext2D, sp: Species, body: string, pose: AnimalPose, R: (tag: string) => Rng): void {
  // [cx, cy, angle] per side. Positive angle tips the top of the limb clockwise.
  let l: [number, number, number] = [-26, 6, 0.5];
  let r: [number, number, number] = [28, 6, -0.5];
  if (pose === 'walkA') {
    l = [-25, 4, 0.15];
    r = [28, 8, -0.85];
  } else if (pose === 'walkB') {
    l = [-26, 8, 0.85];
    r = [27, 4, -0.15];
  } else if (pose === 'happy') {
    l = [-28, -8, -0.55];
    r = [30, -8, 0.55];
  }
  const wing = sp === 'duck' || sp === 'penguin';
  const colour = sp === 'penguin' ? shade(body, 0.12) : body;
  for (const [tag, [cx, cy, a]] of [['L', l], ['R', r]] as const) {
    const pts = rotate(blobPoints(cx, cy, wing ? 6.5 : 5.5, wing ? 11 : 9.5, R(`arm${tag}`), 0.05, 12), cx, cy, a);
    part(g, pts, colour, R(`arm2${tag}`), 2.8, 0.35);
  }
}

function scarf(g: CanvasRenderingContext2D, accent: string, R: (tag: string) => Rng): void {
  const band = [
    { x: -24, y: 2 },
    { x: -8, y: 9 },
    { x: 10, y: 9 },
    { x: 26, y: 1 },
  ];
  inkLine(g, band, 11);
  inkLine(g, band, 7, accent);
  const knot = rotate(blobPoints(-10, 15, 4.5, 8, R('knot'), 0.08, 10), -10, 9, 0.35);
  part(g, knot, accent, R('knot2'), 2.4, 0);
}

function eye(g: CanvasRenderingContext2D, x: number, y: number, r: number, happy: boolean, rng: Rng): void {
  if (happy) {
    inkLine(g, [
      { x: x - r * 0.8, y: y + 1 },
      { x, y: y - r * 0.55 },
      { x: x + r * 0.8, y: y + 1 },
    ], 2.4);
    return;
  }
  const pts = blobPoints(x, y, r, r * 1.05, rng, 0.04, 12);
  solidFill(g, pts, '#ffffff');
  inkOutline(g, pts, rng, 2.2);
  dot(g, x + r * 0.28, y + r * 0.1, r * 0.46);
  dot(g, x + r * 0.42, y - r * 0.12, r * 0.14, '#ffffff');
}

function face(g: CanvasRenderingContext2D, sp: Species, body: string, pose: AnimalPose, R: (tag: string) => Rng): void {
  const happy = pose === 'happy';
  const frog = sp === 'frog';
  const ey = frog ? -30 : -12;
  const er = frog ? 7 : 6.5;
  if (frog) {
    part(g, blobPoints(-7, -29, 10, 9, R('bumpL'), 0.05, 14), body, R('bumpL2'), 3, 0.4);
    part(g, blobPoints(15, -29, 10, 9, R('bumpR'), 0.05, 14), body, R('bumpR2'), 3, 0.4);
  }
  eye(g, -6, ey, er, happy, R('eyeL'));
  eye(g, 14, ey, er, happy, R('eyeR'));

  softDab(g, -15, frog ? -12 : -2, 7, PASTELS.rose, 0.55);
  softDab(g, 23, frog ? -12 : -2, 6, PASTELS.rose, 0.55);

  const smile = (cx: number, cy: number, w: number) => {
    if (happy) {
      const pts = [
        { x: cx - w, y: cy - 1 },
        { x: cx - w * 0.2, y: cy + w * 0.9 },
        { x: cx + w * 0.4, y: cy + w * 0.95 },
        { x: cx + w, y: cy - 1 },
        { x: cx, y: cy - 2 },
      ];
      solidFill(g, pts, '#ff8fab');
      inkOutline(g, pts, R('mouth'), 2);
    } else {
      inkLine(g, [
        { x: cx - w, y: cy - 1.5 },
        { x: cx, y: cy + 1.5 },
        { x: cx + w, y: cy - 1.5 },
      ], 2.2);
    }
  };

  switch (sp) {
    case 'pig': {
      const snout = blobPoints(5, -1, 8.5, 6, R('snout'), 0.05, 14);
      part(g, snout, '#ff9fb8', R('snout2'), 2.4, 0.2);
      dot(g, 2, -1, 1.6);
      dot(g, 8, -1, 1.6);
      smile(5, 9, 4);
      break;
    }
    case 'bear':
    case 'fox': {
      const muzzle = blobPoints(5, -1, 9, 7, R('muzzle'), 0.05, 14);
      solidFill(g, muzzle, sp === 'bear' ? '#f5e3cf' : '#fff8ef');
      inkOutline(g, muzzle, R('muzzle2'), 2);
      dot(g, 6, -4.5, sp === 'bear' ? 3.2 : 2.4);
      smile(5, 2, 3.5);
      break;
    }
    case 'duck':
    case 'penguin': {
      const big = sp === 'duck';
      const beak = blobPoints(8, -2, big ? 10 : 6, big ? 4.5 : 3.5, R('beak'), 0.05, 12);
      part(g, beak, BEAK, R('beak2'), 2.4, 0.2);
      inkLine(g, [
        { x: big ? 0 : 3, y: -2 },
        { x: big ? 17 : 13, y: -2 },
      ], 1.6);
      break;
    }
    case 'frog':
      smile(4, -10, 12);
      break;
    case 'cat':
    case 'bunny': {
      solidFill(g, polyPoints([{ x: 2, y: -5 }, { x: 8, y: -5 }, { x: 5, y: -2 }], 2), PASTELS.rose);
      smile(5, 1, 3.5);
      if (sp === 'cat') {
        inkLine(g, [{ x: -8, y: -3 }, { x: -20, y: -5 }], 1.4);
        inkLine(g, [{ x: -8, y: 0 }, { x: -19, y: 1 }], 1.4);
        inkLine(g, [{ x: 18, y: -3 }, { x: 29, y: -5 }], 1.4);
        inkLine(g, [{ x: 18, y: 0 }, { x: 28, y: 1 }], 1.4);
      } else if (!happy) {
        const tooth = polyPoints([{ x: 3.5, y: 2.5 }, { x: 6.5, y: 2.5 }, { x: 6.5, y: 6 }, { x: 3.5, y: 6 }], 1);
        solidFill(g, tooth, '#ffffff');
        inkOutline(g, tooth, R('tooth'), 1.3);
      }
      break;
    }
  }
}

/** Draw one animal into `g`, filling a `size` x `size` box from (0, 0). */
export function drawAnimal(g: CanvasRenderingContext2D, o: DrawAnimalOptions): void {
  const spec = animalSpec(o.species);
  const body = o.body ?? spec.body;
  // Per-part seeds: the body wobble stays identical across poses, only limbs move.
  const R = (tag: string) => mulberry32(hashSeed(`${o.species}:${tag}`));

  g.save();
  g.translate(o.size / 2, o.size * ANIMAL_BODY_Y);
  g.scale(o.size / 110, o.size / 110);

  tail(g, o.species, body, R);
  ears(g, o.species, body, R);
  feet(g, o.species, body, o.pose, R);

  const torso = eggPoints(2, 0, 27, 32, R('body'));
  part(g, torso, body, R('body2'), 3.2, 0.7);
  softDab(g, 14, 16, 22, shade(body, 0.35), 0.18); // form shading, lower right
  if (spec.belly) {
    const belly = blobPoints(4, 13, 17, 16, R('belly'), 0.05, 16);
    solidFill(g, belly, spec.belly);
    applyGrain(g, 0.4, belly);
  }
  if (o.species === 'duck') {
    inkLine(g, [{ x: -2, y: -32 }, { x: -1, y: -40 }, { x: 4, y: -42 }], 2.2); // head tuft
  }

  scarf(g, o.accent, R);
  arms(g, o.species, body, o.pose, R);
  face(g, o.species, body, o.pose, R);
  g.restore();
}

/** Stable body colour for a species that is used a second (third, ...) time in a room. */
export function repeatBody(spec: AnimalSpec, playerColour: string, round: number): string | undefined {
  if (round <= 0) return undefined;
  return mix(spec.body, playerColour, Math.min(0.45, 0.25 + round * 0.08));
}
