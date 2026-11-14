// Game rules and persistence, written against a minimal key-value store so the
// same logic runs on Devvit Redis (server) and an in-memory store (local tests).
import type {
  Community,
  CompleteResponse,
  DayResult,
  LeaderRow,
  PlayerStats,
  StateResponse,
  SummaryResponse,
} from './api.ts';
import { applyMoves, difficultyFor, generatePuzzle, isSolved, starsFor, weekdayName } from './puzzle.ts';
import type { Puzzle } from './puzzle.ts';

export type Store = {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<unknown>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hIncrBy(key: string, field: string, by: number): Promise<number>;
  zAdd(key: string, ...members: { member: string; score: number }[]): Promise<number>;
  zRange(
    key: string,
    start: number,
    stop: number,
    options: { by: 'rank' }
  ): Promise<{ member: string; score: number }[]>;
  zRank(key: string, member: string): Promise<number | undefined>;
  zScore(key: string, member: string): Promise<number | undefined>;
  zCard(key: string): Promise<number>;
};

const HIST_BUCKETS = 6;
const MAX_MS = 9_999_999;
const k = {
  start: (day: number, u: string) => `d:${day}:start:${u}`,
  result: (day: number, u: string) => `d:${day}:res:${u}`,
  lb: (day: number) => `d:${day}:lb`,
  hist: (day: number) => `d:${day}:hist`,
  stats: (u: string) => `u:${u}:stats`,
  post: (day: number) => `post:day:${day}`,
};

const puzzleCache = new Map<number, Puzzle>();
export const puzzleFor = (day: number): Puzzle => {
  let p = puzzleCache.get(day);
  if (!p) {
    p = generatePuzzle(day);
    puzzleCache.set(day, p);
  }
  return p;
};

const emptyStats = (): PlayerStats => ({ streak: 0, bestStreak: 0, played: 0, parOrBetter: 0, lastDay: 0 });

const readStats = async (s: Store, user: string | null, today: number): Promise<PlayerStats> => {
  if (!user) return emptyStats();
  const raw = await s.get(k.stats(user));
  const st: PlayerStats = raw ? { ...emptyStats(), ...(JSON.parse(raw) as Partial<PlayerStats>) } : emptyStats();
  // a streak survives until the end of the day after the last solve
  if (st.lastDay < today - 1) st.streak = 0;
  return st;
};

const readCommunity = async (s: Store, day: number): Promise<Community> => {
  const h = await s.hGetAll(k.hist(day));
  const histogram = Array.from({ length: HIST_BUCKETS }, (_, i) => Number(h[String(i)] ?? 0));
  const solvers = histogram.reduce((a, b) => a + b, 0);
  return { solvers, histogram, parRate: solvers ? histogram[0]! / solvers : 0 };
};

const readLeaders = async (s: Store, day: number, n = 10): Promise<LeaderRow[]> => {
  const rows = await s.zRange(k.lb(day), 0, n - 1, { by: 'rank' });
  return rows.map((r, i) => ({
    rank: i + 1,
    username: r.member,
    taps: Math.floor(r.score / (MAX_MS + 1)),
    ms: r.score % (MAX_MS + 1),
  }));
};

const readResult = async (s: Store, day: number, user: string | null): Promise<DayResult | null> => {
  if (!user) return null;
  const raw = await s.get(k.result(day, user));
  if (!raw) return null;
  const r = JSON.parse(raw) as { taps: number; ms: number };
  const rank = ((await s.zRank(k.lb(day), user)) ?? -1) + 1;
  return { taps: r.taps, ms: r.ms, stars: starsFor(r.taps, puzzleFor(day).par), rank };
};

export const getState = async (s: Store, day: number, today: number, user: string | null): Promise<StateResponse> => {
  const puzzle = puzzleFor(day);
  const [result, stats, community, leaders] = await Promise.all([
    readResult(s, day, user),
    readStats(s, user, today),
    readCommunity(s, day),
    readLeaders(s, day),
  ]);
  return {
    type: 'state',
    puzzle,
    today,
    username: user,
    difficulty: difficultyFor(day).label,
    weekday: weekdayName(day),
    result,
    stats,
    community,
    leaders,
  };
};

export const getSummary = async (s: Store, day: number, today: number, user: string | null): Promise<SummaryResponse> => {
  const p = puzzleFor(day);
  const [community, result, stats] = await Promise.all([
    readCommunity(s, day),
    readResult(s, day, user),
    readStats(s, user, today),
  ]);
  return {
    type: 'summary',
    day,
    difficulty: difficultyFor(day).label,
    weekday: weekdayName(day),
    size: p.size,
    solvers: community.solvers,
    par: p.par,
    result,
    streak: stats.streak,
    username: user,
  };
};

// Records when a player first opened the puzzle; the timer is server-side.
export const startDay = async (s: Store, day: number, user: string | null, now: number): Promise<number> => {
  if (!user) return now;
  const existing = await s.get(k.start(day, user));
  if (existing) return Number(existing);
  await s.set(k.start(day, user), String(now));
  return now;
};

export class GameError extends Error {}

export const completeDay = async (
  s: Store,
  day: number,
  today: number,
  user: string | null,
  moves: number[],
  now: number
): Promise<CompleteResponse> => {
  const puzzle = puzzleFor(day);
  if (!Array.isArray(moves) || moves.length > 500) throw new GameError('invalid moves');
  const cfg = applyMoves(puzzle, moves);
  if (!cfg || !isSolved(puzzle, cfg)) throw new GameError('that arrangement does not light every lantern');
  const taps = moves.length;

  if (!user) {
    const [community, leaders] = await Promise.all([readCommunity(s, day), readLeaders(s, day)]);
    return {
      type: 'complete',
      result: { taps, ms: 0, stars: starsFor(taps, puzzle.par), rank: 0 },
      stats: emptyStats(),
      community,
      leaders,
      firstSolve: false,
    };
  }

  const prior = await readResult(s, day, user);
  if (prior) {
    // first solve counts; replays never overwrite it
    const [stats, community, leaders] = await Promise.all([
      readStats(s, user, today),
      readCommunity(s, day),
      readLeaders(s, day),
    ]);
    return { type: 'complete', result: prior, stats, community, leaders, firstSolve: false };
  }

  const startedAt = Number((await s.get(k.start(day, user))) ?? now);
  const ms = Math.min(MAX_MS, Math.max(0, now - startedAt));
  await s.set(k.result(day, user), JSON.stringify({ taps, ms }));
  await s.zAdd(k.lb(day), { member: user, score: taps * (MAX_MS + 1) + ms });
  await s.hIncrBy(k.hist(day), String(Math.min(HIST_BUCKETS - 1, Math.max(0, taps - puzzle.par))), 1);

  const stats = await readStats(s, user, today);
  stats.played += 1;
  if (taps <= puzzle.par) stats.parOrBetter += 1;
  // only solving the current daily extends a streak; archive plays still count as played
  if (day === today) {
    if (stats.lastDay === today - 1) stats.streak += 1;
    else if (stats.lastDay !== today) stats.streak = 1;
    stats.lastDay = today;
    stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
  }
  await s.set(k.stats(user), JSON.stringify(stats));

  const [result, community, leaders] = await Promise.all([
    readResult(s, day, user),
    readCommunity(s, day),
    readLeaders(s, day),
  ]);
  return { type: 'complete', result: result!, stats, community, leaders, firstSolve: true };
};

export const formatTime = (ms: number): string => {
  const sec = Math.round(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

export const shareText = (day: number, r: DayResult, par: number, streak: number): string => {
  const stars = '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars);
  const diff = r.taps - par;
  const vsPar = diff <= 0 ? 'at par' : `par +${diff}`;
  const lines = [
    `Lanternlight #${day} — ${stars}`,
    `${r.taps} taps (${vsPar}) in ${formatTime(r.ms)}${r.rank ? ` · #${r.rank} today` : ''}`,
  ];
  if (streak > 1) lines.push(`${streak}-day streak`);
  return lines.join('\n\n');
};

export const postKeyForDay = k.post;

// in-memory Store for tests and local preview
export const memoryStore = (): Store => {
  const kv = new Map<string, string>();
  const hashes = new Map<string, Map<string, string>>();
  const zsets = new Map<string, Map<string, number>>();
  const sorted = (key: string) =>
    [...(zsets.get(key) ?? new Map<string, number>()).entries()]
      .map(([member, score]) => ({ member, score }))
      .sort((a, b) => a.score - b.score || a.member.localeCompare(b.member));
  return {
    get: async (key) => kv.get(key),
    set: async (key, v) => kv.set(key, v),
    hGetAll: async (key) => Object.fromEntries(hashes.get(key) ?? []),
    hIncrBy: async (key, f, by) => {
      const h = hashes.get(key) ?? new Map<string, string>();
      hashes.set(key, h);
      const v = Number(h.get(f) ?? 0) + by;
      h.set(f, String(v));
      return v;
    },
    zAdd: async (key, ...members) => {
      const z = zsets.get(key) ?? new Map<string, number>();
      zsets.set(key, z);
      for (const m of members) z.set(m.member, m.score);
      return members.length;
    },
    zRange: async (key, start, stop) => sorted(key).slice(start, stop + 1),
    zRank: async (key, member) => {
      const i = sorted(key).findIndex((r) => r.member === member);
      return i < 0 ? undefined : i;
    },
    zScore: async (key, member) => zsets.get(key)?.get(member),
    zCard: async (key) => zsets.get(key)?.size ?? 0,
  };
};
