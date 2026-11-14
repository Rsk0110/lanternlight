import type {
  CompleteResponse,
  ErrorResponse,
  ShareResponse,
  StartResponse,
  StateResponse,
  SummaryResponse,
} from '../shared/api.ts';

// `?mock` runs the full game against an in-browser store so the UI can be
// developed and demoed outside Reddit. Never used in the Devvit build.
const MOCK = typeof location !== 'undefined' && new URLSearchParams(location.search).has('mock');

type Api = {
  summary(): Promise<SummaryResponse>;
  state(): Promise<StateResponse>;
  start(): Promise<StartResponse>;
  complete(moves: number[]): Promise<CompleteResponse>;
  share(): Promise<ShareResponse>;
};

const call = async <T>(path: string, body?: unknown): Promise<T> => {
  const res = await fetch(`/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = (await res.json()) as T | ErrorResponse;
  if (!res.ok || (data as ErrorResponse).type === 'error') {
    throw new Error((data as ErrorResponse).message ?? `HTTP ${res.status}`);
  }
  return data as T;
};

const realApi: Api = {
  summary: () => call<SummaryResponse>('summary'),
  state: () => call<StateResponse>('state'),
  start: () => call<StartResponse>('start', {}),
  complete: (moves) => call<CompleteResponse>('complete', { moves }),
  share: () => call<ShareResponse>('share', {}),
};

const mockApi = async (): Promise<Api> => {
  const game = await import('../shared/game.ts');
  const { dayFromDate } = await import('../shared/puzzle.ts');
  const store = game.memoryStore();
  const params = new URLSearchParams(location.search);
  const today = Math.max(1, dayFromDate(new Date()));
  const day = Number(params.get('day') ?? today);
  const user = params.get('user') ?? 'demo_player';
  // seed some community results so the histogram and leaderboard look alive
  const p = game.puzzleFor(day);
  const free = p.cells.flatMap((c) => (c.kind === 'mirror' && !c.locked ? [c.id] : []));
  const { applyMoves, isSolved } = await import('../shared/puzzle.ts');
  let sol: number[] = [];
  for (let mask = 0; mask < 1 << free.length; mask++) {
    const moves = free.filter((_, i) => (mask >> i) & 1);
    if (moves.length === p.par && isSolved(p, applyMoves(p, moves)!)) {
      sol = moves;
      break;
    }
  }
  const names = ['moonmoth', 'quietharbor', 'lampwright', 'nightjar_', 'fennel_fox', 'paperboat', 'ember_owl', 'tidepool', 'skylark99', 'driftwood'];
  for (let i = 0; i < names.length; i++) {
    const extra = [0, 0, 0, 1, 1, 1, 2, 2, 3, 5][i]!;
    const pad = free.find((id) => !sol.includes(id)) ?? sol[0]!;
    const moves = [...Array.from({ length: extra }, () => [pad, pad]).flat(), ...sol];
    await game.startDay(store, day, names[i]!, 0);
    await game.completeDay(store, day, today, names[i]!, moves, 40_000 + i * 17_000);
  }
  return {
    summary: () => game.getSummary(store, day, today, user),
    state: () => game.getState(store, day, today, user),
    start: async () => ({ type: 'start', startedAt: await game.startDay(store, day, user, Date.now()) }),
    complete: (moves) => game.completeDay(store, day, today, user, moves, Date.now()),
    share: async () => ({ type: 'share', ok: true, message: 'Shared to the comments' }),
  };
};

let apiPromise: Promise<Api> | null = null;
export const getApi = (): Promise<Api> => (apiPromise ??= MOCK ? mockApi() : Promise.resolve(realApi));
export const isMock = MOCK;
