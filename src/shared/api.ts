import type { Puzzle } from './puzzle.ts';

export type PlayerStats = {
  streak: number;
  bestStreak: number;
  played: number;
  parOrBetter: number;
  lastDay: number;
};

export type DayResult = {
  taps: number;
  ms: number;
  stars: 1 | 2 | 3;
  rank: number;
};

export type Community = {
  solvers: number;
  // histogram of taps relative to par: index 0 = par, 1 = par+1 ... last bucket = par+5 or more
  histogram: number[];
  parRate: number; // 0..1
};

export type LeaderRow = { rank: number; username: string; taps: number; ms: number };

export type StateResponse = {
  type: 'state';
  puzzle: Puzzle;
  today: number; // current daily number (the post may be an older day)
  username: string | null;
  difficulty: string;
  weekday: string;
  result: DayResult | null;
  stats: PlayerStats;
  community: Community;
  leaders: LeaderRow[];
};

export type StartResponse = { type: 'start'; startedAt: number };

export type CompleteRequest = { moves: number[] };
export type CompleteResponse = {
  type: 'complete';
  result: DayResult;
  stats: PlayerStats;
  community: Community;
  leaders: LeaderRow[];
  firstSolve: boolean;
};

export type ShareResponse = { type: 'share'; ok: boolean; message: string };

export type SummaryResponse = {
  type: 'summary';
  day: number;
  difficulty: string;
  weekday: string;
  size: number;
  solvers: number;
  par: number;
  result: DayResult | null;
  streak: number;
  username: string | null;
};

export type ErrorResponse = { type: 'error'; message: string };
