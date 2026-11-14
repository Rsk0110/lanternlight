// Lanternlight puzzle core: deterministic daily generation, beam tracing and an
// exact solver for par. Shared by server (authoritative) and client (rendering).

export type Dir = 0 | 1 | 2 | 3; // 0 up, 1 right, 2 down, 3 left
export type Mirror = '/' | '\\';

export type Cell =
  | { kind: 'empty' }
  | { kind: 'lantern' }
  | { kind: 'rock' }
  | { kind: 'mirror'; id: number; locked: boolean };

export type Source = { row: number; col: number; dir: Dir }; // row/col is the first cell the beam enters

export type Puzzle = {
  day: number;
  size: number;
  cells: Cell[]; // row-major
  source: Source;
  start: Mirror[]; // scrambled orientation per mirror id
  par: number; // minimum taps to solve
  lanterns: number;
};

export type BeamStep = { row: number; col: number; inDir: Dir; outDir: Dir | null };

export type Trace = {
  steps: BeamStep[];
  lit: Set<number>; // lantern cell indices that the beam passed through
  exit: { row: number; col: number; dir: Dir } | null; // where the beam left the grid
  looped: boolean;
};

const DR = [-1, 0, 1, 0];
const DC = [0, 1, 0, -1];

// '/' : up<->right, down<->left.  '\' : up<->left, down<->right.
export const reflect = (dir: Dir, m: Mirror): Dir => {
  if (m === '/') return ([1, 0, 3, 2] as const)[dir];
  return ([3, 2, 1, 0] as const)[dir];
};

export const flip = (m: Mirror): Mirror => (m === '/' ? '\\' : '/');

export const trace = (p: Pick<Puzzle, 'size' | 'cells' | 'source'>, mirrors: readonly Mirror[]): Trace => {
  const { size, cells } = p;
  let row = p.source.row;
  let col = p.source.col;
  let dir: Dir = p.source.dir;
  const steps: BeamStep[] = [];
  const lit = new Set<number>();
  const seen = new Set<number>();
  while (true) {
    if (row < 0 || col < 0 || row >= size || col >= size) {
      return { steps, lit, exit: { row, col, dir }, looped: false };
    }
    const idx = row * size + col;
    const key = idx * 4 + dir;
    if (seen.has(key)) return { steps, lit, exit: null, looped: true };
    seen.add(key);
    const cell = cells[idx]!;
    let out: Dir | null = dir;
    if (cell.kind === 'rock') out = null;
    else if (cell.kind === 'mirror') out = reflect(dir, mirrors[cell.id]!);
    else if (cell.kind === 'lantern') lit.add(idx);
    steps.push({ row, col, inDir: dir, outDir: out });
    if (out === null) return { steps, lit, exit: null, looped: false };
    dir = out;
    row += DR[dir]!;
    col += DC[dir]!;
  }
};

export const isSolved = (p: Puzzle, mirrors: readonly Mirror[]): boolean =>
  trace(p, mirrors).lit.size === p.lanterns;

// ---------- seeded randomness ----------

export const hashString = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

type Rng = () => number;
const randInt = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const shuffle = <T>(rng: Rng, arr: T[]): T[] => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
};

// ---------- days ----------

// Day 1 = 2026-11-14 (UTC). Everything keys off this number.
export const EPOCH_UTC = Date.UTC(2026, 10, 14);
const DAY_MS = 86_400_000;

export const dayFromDate = (d: Date): number => Math.floor((d.getTime() - EPOCH_UTC) / DAY_MS) + 1;
export const dateFromDay = (day: number): Date => new Date(EPOCH_UTC + (day - 1) * DAY_MS);
export const weekdayName = (day: number): string =>
  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dateFromDay(day).getUTCDay()]!;

// Difficulty ramps through the week: Monday easiest, Sunday hardest.
export type Difficulty = {
  label: string;
  size: number;
  minTurns: number;
  maxTurns: number;
  lanterns: number;
  decoys: number;
  rocks: number;
  locked: number;
  minPar: number;
  maxPar: number;
  turnP: number;
  scrambleP: number;
};

export const difficultyFor = (day: number): Difficulty => {
  const wd = dateFromDay(day).getUTCDay(); // 0 Sun .. 6 Sat
  const tier = wd === 0 ? 6 : wd - 1; // Mon 0 .. Sun 6
  const table: Difficulty[] = [
    { label: 'Gentle', size: 5, minTurns: 3, maxTurns: 4, lanterns: 2, decoys: 1, rocks: 1, locked: 0, minPar: 2, maxPar: 3, turnP: 0.5, scrambleP: 0.6 },
    { label: 'Easy', size: 5, minTurns: 4, maxTurns: 5, lanterns: 3, decoys: 2, rocks: 1, locked: 1, minPar: 3, maxPar: 4, turnP: 0.5, scrambleP: 0.6 },
    { label: 'Steady', size: 6, minTurns: 4, maxTurns: 6, lanterns: 3, decoys: 2, rocks: 2, locked: 1, minPar: 3, maxPar: 5, turnP: 0.55, scrambleP: 0.65 },
    { label: 'Tricky', size: 6, minTurns: 5, maxTurns: 7, lanterns: 4, decoys: 3, rocks: 2, locked: 1, minPar: 4, maxPar: 6, turnP: 0.6, scrambleP: 0.7 },
    { label: 'Hard', size: 7, minTurns: 6, maxTurns: 8, lanterns: 4, decoys: 3, rocks: 3, locked: 2, minPar: 5, maxPar: 7, turnP: 0.65, scrambleP: 0.75 },
    { label: 'Fiendish', size: 7, minTurns: 7, maxTurns: 9, lanterns: 5, decoys: 4, rocks: 3, locked: 1, minPar: 6, maxPar: 8, turnP: 0.7, scrambleP: 0.8 },
    { label: 'Midnight', size: 8, minTurns: 8, maxTurns: 11, lanterns: 5, decoys: 5, rocks: 4, locked: 2, minPar: 7, maxPar: 10, turnP: 0.7, scrambleP: 0.85 },
  ];
  return table[tier]!;
};

// ---------- solver ----------

// Minimum taps from `start` to any configuration that lights every lantern.
// Locked mirrors can't change. Brute force over subsets ordered by popcount;
// boards have <= 16 free mirrors so this is at most 65k traces.
export const solve = (p: Omit<Puzzle, 'par'>): { par: number; solutions: number } => {
  const mirrorCells = p.cells.filter((c): c is Extract<Cell, { kind: 'mirror' }> => c.kind === 'mirror');
  const free = mirrorCells.filter((c) => !c.locked).map((c) => c.id);
  const n = free.length;
  let best = Infinity;
  let solutions = 0;
  const cfg = p.start.slice();
  for (let mask = 0; mask < 1 << n; mask++) {
    let bits = 0;
    for (let i = 0; i < n; i++) {
      const on = (mask >> i) & 1;
      bits += on;
      cfg[free[i]!] = on ? flip(p.start[free[i]!]!) : p.start[free[i]!]!;
    }
    if (bits > best) continue;
    if (trace(p, cfg).lit.size === p.lanterns) {
      if (bits < best) {
        best = bits;
        solutions = 1;
      } else solutions++;
    }
  }
  return { par: best === Infinity ? -1 : best, solutions };
};

// ---------- generator ----------

const tryGenerate = (day: number, rng: Rng, d: Difficulty): Puzzle | null => {
  const { size } = d;
  // pick an entry point on a random edge
  const edge = randInt(rng, 0, 3);
  const k = randInt(rng, 1, size - 2);
  const source: Source =
    edge === 0
      ? { row: 0, col: k, dir: 2 }
      : edge === 1
        ? { row: k, col: size - 1, dir: 3 }
        : edge === 2
          ? { row: size - 1, col: k, dir: 0 }
          : { row: k, col: 0, dir: 1 };

  // random self-avoiding walk that turns at mirrors
  const turnsTarget = randInt(rng, d.minTurns, d.maxTurns);
  const path: { idx: number; turn: Mirror | null }[] = [];
  const used = new Set<number>();
  let row = source.row;
  let col = source.col;
  let dir: Dir = source.dir;
  let turns = 0;
  let straight = 0;
  while (row >= 0 && col >= 0 && row < size && col < size) {
    const idx = row * size + col;
    if (used.has(idx)) return null;
    used.add(idx);
    let turn: Mirror | null = null;
    const wantTurn = turns < turnsTarget && straight >= 1 && rng() < d.turnP;
    if (wantTurn) {
      const options: Mirror[] = shuffle(rng, ['/', '\\'] as Mirror[]);
      for (const m of options) {
        const nd = reflect(dir, m);
        const nr = row + DR[nd]!;
        const nc = col + DC[nd]!;
        const inside = nr >= 0 && nc >= 0 && nr < size && nc < size;
        if (inside && !used.has(nr * size + nc)) {
          turn = m;
          break;
        }
      }
    }
    path.push({ idx, turn });
    if (turn) {
      dir = reflect(dir, turn);
      turns++;
      straight = 0;
    } else straight++;
    row += DR[dir]!;
    col += DC[dir]!;
  }
  if (turns < d.minTurns) return null;

  const cells: Cell[] = Array.from({ length: size * size }, () => ({ kind: 'empty' }) as Cell);
  const solution: Mirror[] = [];
  const lockedIds = new Set<number>();
  for (const step of path) {
    if (step.turn) {
      cells[step.idx] = { kind: 'mirror', id: solution.length, locked: false };
      solution.push(step.turn);
    }
  }
  // lanterns on plain path cells, biased toward the far end of the beam
  const plain = path.filter((s) => !s.turn).map((s) => s.idx);
  if (plain.length < d.lanterns) return null;
  const tail = plain.slice(Math.floor(plain.length / 3));
  const pool = tail.length >= d.lanterns ? tail : plain;
  const lanternIdx = shuffle(rng, pool.slice()).slice(0, d.lanterns);
  // always light the last stretch so the full route matters
  if (!lanternIdx.includes(plain[plain.length - 1]!)) lanternIdx[0] = plain[plain.length - 1]!;
  for (const i of lanternIdx) cells[i] = { kind: 'lantern' };

  // decoy mirrors and rocks off the path
  const offPath = shuffle(
    rng,
    Array.from({ length: size * size }, (_, i) => i).filter((i) => !used.has(i))
  );
  for (let i = 0; i < d.decoys && offPath.length; i++) {
    const at = offPath.pop()!;
    cells[at] = { kind: 'mirror', id: solution.length, locked: false };
    solution.push(rng() < 0.5 ? '/' : '\\');
  }
  for (let i = 0; i < d.rocks && offPath.length; i++) cells[offPath.pop()!] = { kind: 'rock' };

  // lock a few on-path mirrors in their correct orientation (anchors for reasoning)
  const pathMirrorIds = cells
    .filter((c): c is Extract<Cell, { kind: 'mirror' }> => c.kind === 'mirror')
    .map((c) => c.id)
    .filter((id) => id < turns);
  for (const id of shuffle(rng, pathMirrorIds).slice(0, d.locked)) lockedIds.add(id);
  for (const c of cells) if (c.kind === 'mirror' && lockedIds.has(c.id)) c.locked = true;

  // scramble free mirrors
  const start = solution.map((m, id) => (lockedIds.has(id) ? m : rng() < d.scrambleP ? flip(m) : m));
  const base = { day, size, cells, source, start, lanterns: d.lanterns };
  if (trace(base, start).lit.size === d.lanterns) return null;
  const { par } = solve(base);
  if (par < d.minPar || par > d.maxPar) return null;
  return { ...base, par };
};

export const generatePuzzle = (day: number): Puzzle => {
  const d = difficultyFor(day);
  const rng = mulberry32(hashString(`lanternlight:${day}`));
  for (let attempt = 0; attempt < 5000; attempt++) {
    const p = tryGenerate(day, rng, d);
    if (p) return p;
  }
  // fallback: relax par bounds (never expected in practice; covered by tests)
  const relaxed = { ...d, minPar: 1, maxPar: 99 };
  for (let attempt = 0; attempt < 5000; attempt++) {
    const p = tryGenerate(day, rng, relaxed);
    if (p) return p;
  }
  throw new Error(`could not generate puzzle for day ${day}`);
};

// Apply a list of tapped mirror ids to the starting orientation.
export const applyMoves = (p: Puzzle, moves: readonly number[]): Mirror[] | null => {
  const cfg = p.start.slice();
  const lockedOrMissing = (id: number) => {
    const cell = p.cells.find((c) => c.kind === 'mirror' && c.id === id);
    return !cell || (cell.kind === 'mirror' && cell.locked);
  };
  for (const id of moves) {
    if (!Number.isInteger(id) || id < 0 || id >= cfg.length || lockedOrMissing(id)) return null;
    cfg[id] = flip(cfg[id]!);
  }
  return cfg;
};

export const starsFor = (taps: number, par: number): 1 | 2 | 3 => (taps <= par ? 3 : taps <= par + 2 ? 2 : 1);
