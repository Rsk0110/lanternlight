import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completeDay, GameError, getState, memoryStore, puzzleFor, shareText, startDay } from './game.ts';
import { applyMoves, isSolved } from './puzzle.ts';

const solutionFor = (day: number, extra = 0): number[] => {
  const p = puzzleFor(day);
  const free = p.cells.flatMap((c) => (c.kind === 'mirror' && !c.locked ? [c.id] : []));
  for (let mask = 0; mask < 1 << free.length; mask++) {
    const moves = free.filter((_, i) => (mask >> i) & 1);
    if (moves.length !== p.par) continue;
    if (isSolved(p, applyMoves(p, moves)!)) {
      // pad with a wasted double-tap to simulate a worse solve
      const pad = free.find((id) => !moves.includes(id)) ?? moves[0]!;
      return [...Array.from({ length: extra }, () => [pad, pad]).flat(), ...moves];
    }
  }
  throw new Error('no solution');
};

test('full flow: start, solve, leaderboard, histogram, streak', async () => {
  const s = memoryStore();
  const day = 5;
  await startDay(s, day, 'alice', 1000);
  await startDay(s, day, 'bob', 1000);
  const a = await completeDay(s, day, day, 'alice', solutionFor(day), 31_000);
  assert.equal(a.firstSolve, true);
  assert.equal(a.result.taps, puzzleFor(day).par);
  assert.equal(a.result.ms, 30_000);
  assert.equal(a.result.stars, 3);
  assert.equal(a.result.rank, 1);
  assert.equal(a.stats.streak, 1);

  const b = await completeDay(s, day, day, 'bob', solutionFor(day, 1), 11_000);
  assert.equal(b.result.taps, puzzleFor(day).par + 2);
  assert.equal(b.result.rank, 2, 'more taps ranks lower even when faster');
  assert.equal(b.community.solvers, 2);
  assert.deepEqual(b.community.histogram, [1, 0, 1, 0, 0, 0]);
  assert.equal(b.community.parRate, 0.5);
  assert.deepEqual(
    b.leaders.map((r) => r.username),
    ['alice', 'bob']
  );

  // replay never overwrites the first result
  const again = await completeDay(s, day, day, 'alice', solutionFor(day, 3), 99_000);
  assert.equal(again.firstSolve, false);
  assert.equal(again.result.taps, puzzleFor(day).par);

  // streak continues next day, resets after a gap
  const d2 = await completeDay(s, day + 1, day + 1, 'alice', solutionFor(day + 1), 0);
  assert.equal(d2.stats.streak, 2);
  const st = await getState(s, day + 3, day + 3, 'alice');
  assert.equal(st.stats.streak, 0);
  assert.equal(st.stats.bestStreak, 2);
  const d4 = await completeDay(s, day + 3, day + 3, 'alice', solutionFor(day + 3), 0);
  assert.equal(d4.stats.streak, 1);
  assert.equal(d4.stats.played, 3);
});

test('archive plays do not touch streak', async () => {
  const s = memoryStore();
  const r = await completeDay(s, 2, 10, 'carol', solutionFor(2), 0);
  assert.equal(r.stats.streak, 0);
  assert.equal(r.stats.played, 1);
});

test('rejects wrong or forged answers', async () => {
  const s = memoryStore();
  await assert.rejects(completeDay(s, 4, 4, 'eve', [], 0), GameError);
  await assert.rejects(completeDay(s, 4, 4, 'eve', [9999], 0), GameError);
  const p = puzzleFor(4);
  const locked = p.cells.flatMap((c) => (c.kind === 'mirror' && c.locked ? [c.id] : []));
  if (locked.length) await assert.rejects(completeDay(s, 4, 4, 'eve', [locked[0]!, ...solutionFor(4)], 0), GameError);
});

test('logged-out players can play without being recorded', async () => {
  const s = memoryStore();
  const r = await completeDay(s, 3, 3, null, solutionFor(3), 0);
  assert.equal(r.result.rank, 0);
  assert.equal((await getState(s, 3, 3, null)).community.solvers, 0);
});

test('share text', () => {
  const t = shareText(12, { taps: 5, ms: 83_000, stars: 2, rank: 4 }, 4, 3);
  assert.match(t, /Lanternlight #12 — ★★☆/);
  assert.match(t, /5 taps \(par \+1\) in 1:23 · #4 today/);
  assert.match(t, /3-day streak/);
});
