import './index.css';

import { StrictMode, useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { SummaryResponse } from '../shared/api.ts';
import { requestExpandedMode } from '@devvit/web/client';
import { getApi, isMock } from './api.ts';

const open = (e: MouseEvent) => {
  if (isMock) {
    location.href = `game.html${location.search}`;
    return;
  }
  requestExpandedMode(e.nativeEvent, 'game');
};

export const Splash = () => {
  const [s, setS] = useState<SummaryResponse | null>(null);
  useEffect(() => {
    void getApi()
      .then((api) => api.summary())
      .then(setS)
      .catch(() => undefined);
  }, []);

  return (
    <div className="screen splash">
      <div className="sky" aria-hidden>
        {Array.from({ length: 22 }, (_, i) => (
          <span key={i} className="star-dot" style={{ left: `${(i * 41) % 100}%`, top: `${(i * 29) % 70}%`, animationDelay: `${(i % 7) * 0.5}s` }} />
        ))}
      </div>
      <div className="float-lanterns" aria-hidden>
        {[12, 30, 68, 86].map((x, i) => (
          <svg key={x} viewBox="-40 -40 80 90" className="float-lantern" style={{ left: `${x}%`, animationDelay: `${i * 1.3}s` }}>
            <path d="M -24 -24 C -36 -4 -36 12 -22 26 L 22 26 C 36 12 36 -4 24 -24 Z" fill="#ffbe55" />
            <rect x={-12} y={-34} width={24} height={8} rx={3} fill="#7a3d1c" />
          </svg>
        ))}
      </div>

      <div className="splash-body">
        <svg viewBox="0 0 300 110" className="hero" aria-hidden>
          <defs>
            <filter id="hglow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {[0, 1, 2, 3, 4].map((c) =>
            [0, 1].map((r) => <rect key={`${c}${r}`} x={40 + c * 46} y={10 + r * 46} width={42} height={42} rx={8} fill="#1c2350" stroke="#2c3570" />)
          )}
          <polyline points="14,31 107,31 107,77 199,77 199,31 268,31" fill="none" stroke="#ffbe55" strokeWidth={5} strokeLinejoin="round" filter="url(#hglow)" className="hero-beam" />
          <circle cx={14} cy={31} r={10} fill="#fff8de" filter="url(#hglow)" />
          {[
            [107, 31, 45],
            [107, 77, 45],
            [199, 77, -45],
            [199, 31, -45],
          ].map(([x, y, a]) => (
            <rect key={`${x}${y}`} x={x! - 17} y={y! - 3} width={34} height={6} rx={3} fill="#dfe5ff" transform={`rotate(${a} ${x} ${y})`} />
          ))}
          <g transform="translate(153 77) scale(0.5)">
            <path d="M -24 -24 C -36 -4 -36 12 -22 26 L 22 26 C 36 12 36 -4 24 -24 Z" fill="#ffbe55" filter="url(#hglow)" />
          </g>
          <g transform="translate(245 31) scale(0.5)">
            <path d="M -24 -24 C -36 -4 -36 12 -22 26 L 22 26 C 36 12 36 -4 24 -24 Z" fill="#ffbe55" filter="url(#hglow)" />
          </g>
        </svg>
        <p className="eyebrow">{s ? `#${s.day} · ${s.weekday}` : 'Daily light puzzle'}</p>
        <h1 className="splash-title">Lanternlight</h1>
        <p className="splash-tag">Turn the mirrors. Light every lantern. Fewest taps wins.</p>
        {s && (
          <div className="chips">
            <span className="chip">{s.difficulty}</span>
            <span className="chip">
              {s.size}×{s.size}
            </span>
            <span className="chip">par {s.par}</span>
            <span className="chip">{s.solvers} solved</span>
          </div>
        )}
        <button className="btn primary big" onClick={open}>
          {s?.result ? `Solved in ${s.result.taps} taps ${'★'.repeat(s.result.stars)} — see results` : 'Light the lanterns'}
        </button>
        {s && s.streak > 0 && <p className="streak-chip">{s.streak}-day streak — keep it going</p>}
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
