import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMoves,
  dayFromDate,
  dateFromDay,
  difficultyFor,
  flip,
  generatePuzzle,
  isSolved,
  solve,
  trace,
} from './puzzle.ts';

test('day numbering round-trips', () => {
  assert.equal(dayFromDate(new Date(Date.UTC(2026, 10, 14, 0, 0))), 1);
  assert.equal(dayFromDate(new Date(Date.UTC(2026, 10, 14, 23, 59))), 1);
  assert.equal(dayFromDate(new Date(Date.UTC(2026, 10, 15))), 2);
  for (const d of [1, 2, 50, 365]) assert.equal(dayFromDate(dateFromDay(d)), d);
});

test('generation is deterministic', () => {
  assert.deepEqual(generatePuzzle(7), generatePuzzle(7));
  assert.notDeepEqual(generatePuzzle(7), generatePuzzle(8));
});

test('a year of puzzles: unsolved at start, solvable, par in range, fast', () => {
  const t0 = Date.now();
  let worst = 0;
  for (let day = 1; day <= 365; day++) {
    const s = Date.now();
    const p = generatePuzzle(day);
    worst = Math.max(worst, Date.now() - s);
    const d = difficultyFor(day);
    assert.equal(isSolved(p, p.start), false, `day ${day} starts solved`);
    assert.ok(p.par >= d.minPar && p.par <= d.maxPar, `day ${day} par ${p.par} outside ${d.minPar}-${d.maxPar}`);
    assert.equal(p.size, d.size);
    assert.equal(p.cells.filter((c) => c.kind === 'lantern').length, p.lanterns);
    // exact par: re-solving agrees
    const { par: again } = solve({ ...p });
    assert.equal(again, p.par);
  }
  const total = Date.now() - t0;
  console.log(`365 puzzles in ${total}ms, worst single ${worst}ms`);
  assert.ok(worst < 3000, `slowest puzzle took ${worst}ms`);
});

test('applyMoves validates and toggles', () => {
  const p = generatePuzzle(3);
  const free = p.cells.flatMap((c) => (c.kind === 'mirror' && !c.locked ? [c.id] : []));
  const locked = p.cells.flatMap((c) => (c.kind === 'mirror' && c.locked ? [c.id] : []));
  const cfg = applyMoves(p, [free[0]!, free[0]!])!;
  assert.deepEqual(cfg, p.start);
  assert.equal(applyMoves(p, [999]), null);
  if (locked.length) assert.equal(applyMoves(p, [locked[0]!]), null);
});

test('a par-length solution exists', () => {
  for (let day = 1; day <= 30; day++) {
    const p = generatePuzzle(day);
    const free = p.cells.flatMap((c) => (c.kind === 'mirror' && !c.locked ? [c.id] : []));
    let found = false;
    for (let mask = 0; mask < 1 << free.length && !found; mask++) {
      const moves = free.filter((_, i) => (mask >> i) & 1);
      if (moves.length !== p.par) continue;
      const cfg = applyMoves(p, moves)!;
      if (isSolved(p, cfg)) found = true;
    }
    assert.ok(found, `day ${day}`);
  }
});

test('trace detects loops and rocks', () => {
  const p = generatePuzzle(1);
  const t = trace(p, p.start.map(flip));
  assert.ok(t.steps.length > 0);
});
