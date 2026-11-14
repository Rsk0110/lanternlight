import { useMemo } from 'react';
import type { Dir, Mirror, Puzzle, Trace } from '../shared/puzzle.ts';

const U = 100; // one cell in SVG units
const DR = [-1, 0, 1, 0];
const DC = [0, 1, 0, -1];

type Props = {
  puzzle: Puzzle;
  mirrors: Mirror[];
  spins: number[]; // accumulated quarter-turns per mirror, for smooth rotation
  trace: Trace;
  solved: boolean;
  released: boolean; // lanterns float away after a solve
  hint: boolean;
  shake: number | null; // mirror id that was tapped while locked
  onTap: (id: number) => void;
};

const center = (row: number, col: number) => ({ x: (col + 1.5) * U, y: (row + 1.5) * U });

const beamPoints = (p: Puzzle, t: Trace): { points: string; length: number } => {
  const { source } = p;
  const back = ((source.dir + 2) % 4) as Dir;
  const origin = center(source.row + DR[back]! * 0.62, source.col + DC[back]! * 0.62);
  const pts = [origin];
  for (const s of t.steps) pts.push(center(s.row, s.col));
  if (t.exit) pts.push(center(t.exit.row - DR[t.exit.dir]! * 0.45, t.exit.col - DC[t.exit.dir]! * 0.45));
  else {
    const last = t.steps[t.steps.length - 1];
    // stop the beam at the face of a rock instead of its centre
    if (last && last.outDir === null) {
      const c = center(last.row, last.col);
      pts[pts.length - 1] = { x: c.x - DC[last.inDir]! * 32, y: c.y - DR[last.inDir]! * 32 };
    }
  }
  let length = 0;
  for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  return { points: pts.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' '), length: Math.ceil(length) + 1 };
};

export const Board = ({ puzzle, mirrors, spins, trace, solved, released, hint, shake, onTap }: Props) => {
  const { size, cells, source } = puzzle;
  const span = (size + 2) * U;
  const { points, length } = useMemo(() => beamPoints(puzzle, trace), [puzzle, trace]);
  // beam draws itself at a constant speed so long paths take a little longer
  const beamStyle = { strokeDasharray: length, strokeDashoffset: length, animationDuration: `${Math.min(900, 180 + length * 0.35)}ms` };
  const back = ((source.dir + 2) % 4) as Dir;
  const emitter = center(source.row + DR[back]! * 0.75, source.col + DC[back]! * 0.75);
  const emitterAngle = [180, 270, 0, 90][source.dir]!; // the lamp's nozzle points along +y at 0°

  return (
    <svg
      viewBox={`${U * 0.35} ${U * 0.35} ${span - U * 0.7} ${span - U * 0.7}`}
      className="board"
      role="grid"
      aria-label={`Lanternlight board, ${size} by ${size}`}
    >
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="7" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="lanternLit" cx="50%" cy="55%" r="60%">
          <stop offset="0%" stopColor="#fff4c2" />
          <stop offset="45%" stopColor="#ffbe55" />
          <stop offset="100%" stopColor="#e8662a" />
        </radialGradient>
        <radialGradient id="halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,190,85,0.55)" />
          <stop offset="100%" stopColor="rgba(255,190,85,0)" />
        </radialGradient>
        <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f3f6ff" />
          <stop offset="50%" stopColor="#a9b6e8" />
          <stop offset="100%" stopColor="#e7ecff" />
        </linearGradient>
        <radialGradient id="stone" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#4a4f78" />
          <stop offset="100%" stopColor="#24274a" />
        </radialGradient>
      </defs>

      {/* tiles */}
      {cells.map((_, i) => {
        const r = Math.floor(i / size);
        const c = i % size;
        return (
          <rect
            key={`t${i}`}
            x={(c + 1) * U + 4}
            y={(r + 1) * U + 4}
            width={U - 8}
            height={U - 8}
            rx={14}
            className="tile"
          />
        );
      })}

      {/* lantern halos sit under the beam */}
      {cells.map((cell, i) => {
        if (cell.kind !== 'lantern' || !trace.lit.has(i)) return null;
        const { x, y } = center(Math.floor(i / size), i % size);
        return <circle key={`h${i}`} cx={x} cy={y} r={U * 0.75} fill="url(#halo)" className={released ? "halo gone" : "halo"} />;
      })}

      {/* beam */}
      <polyline key={points} points={points} className={`beam ${solved ? 'beam-solved' : ''}`} filter="url(#glow)" style={beamStyle} />
      <polyline key={`${points}-core`} points={points} className="beam-core" style={beamStyle} />

      {/* emitter: a small moon-lamp on the rim */}
      <g transform={`translate(${emitter.x} ${emitter.y}) rotate(${emitterAngle})`} className="emitter">
        <circle r={26} fill="#ffe7a3" filter="url(#glow)" />
        <circle r={17} fill="#fff8de" />
        <path d="M -14 22 L 0 40 L 14 22 Z" fill="#ffe7a3" opacity={0.8} />
      </g>

      {/* pieces */}
      {cells.map((cell, i) => {
        const r = Math.floor(i / size);
        const c = i % size;
        const { x, y } = center(r, c);
        if (cell.kind === 'rock') {
          return (
            <g key={`p${i}`} transform={`translate(${x} ${y})`}>
              <path d="M -30 14 C -34 -10 -14 -30 6 -28 C 26 -26 36 -6 30 14 C 24 30 -24 32 -30 14 Z" fill="url(#stone)" />
              <path d="M -10 -14 C -2 -20 10 -18 16 -10" stroke="#6b71a6" strokeWidth={4} fill="none" strokeLinecap="round" />
            </g>
          );
        }
        if (cell.kind === 'lantern') {
          const lit = trace.lit.has(i);
          return (
            <g key={`p${i}`} transform={`translate(${x} ${y})`} aria-label={lit ? 'lit lantern' : 'dark lantern'}>
              <g
                className={`lantern ${lit ? 'lit' : ''} ${released && lit ? 'released' : ''}`}
                style={{ animationDelay: released ? `${(i % 5) * 140}ms` : `${(i % 7) * 300}ms` }}
              >
                <rect x={-12} y={-34} width={24} height={8} rx={3} className="lantern-cap" />
                <path d="M -24 -24 C -36 -4 -36 12 -22 26 L 22 26 C 36 12 36 -4 24 -24 Z" className="lantern-body" />
                <path d="M -8 -24 C -14 -4 -14 10 -8 26 M 8 -24 C 14 -4 14 10 8 26" className="lantern-ribs" />
                <rect x={-10} y={26} width={20} height={6} rx={2} className="lantern-cap" />
                <path d="M 0 32 L 0 42" className="lantern-tassel" />
              </g>
            </g>
          );
        }
        if (cell.kind === 'mirror') {
          const angle = (puzzle.start[cell.id] === '/' ? -45 : 45) + spins[cell.id]! * 90;
          const onBeam = trace.steps.some((s) => s.row === r && s.col === c);
          return (
            <g
              key={`p${i}`}
              transform={`translate(${x} ${y})`}
              className={`mirror ${cell.locked ? 'locked' : ''} ${hint && !cell.locked ? 'hint' : ''} ${shake === cell.id ? 'shake' : ''} ${onBeam ? 'on-beam' : ''}`}
              role="button"
              tabIndex={cell.locked || solved ? -1 : 0}
              aria-label={`${cell.locked ? 'fixed ' : ''}mirror, row ${r + 1} column ${c + 1}, ${mirrors[cell.id] === '/' ? 'leaning right' : 'leaning left'}`}
              onPointerDown={(e) => {
                e.preventDefault();
                if (!solved) onTap(cell.id);
              }}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !solved) {
                  e.preventDefault();
                  onTap(cell.id);
                }
              }}
            >
              <rect x={-U / 2 + 4} y={-U / 2 + 4} width={U - 8} height={U - 8} rx={14} className="mirror-hit" />
              <circle r={36} className="mirror-socket" />
              <g className="mirror-spin" style={{ transform: `rotate(${angle}deg)` }}>
                <rect x={-38} y={-6} width={76} height={12} rx={6} fill="url(#glass)" className="mirror-glass" />
                <rect x={-34} y={-2} width={68} height={2.5} rx={1} fill="#ffffff" opacity={0.85} />
              </g>
              {cell.locked && <circle r={7} className="mirror-pin" />}
            </g>
          );
        }
        return null;
      })}
    </svg>
  );
};
