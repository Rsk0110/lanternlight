import './index.css';

import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CompleteResponse, StateResponse } from '../shared/api.ts';
import { flip, trace } from '../shared/puzzle.ts';
import type { Mirror } from '../shared/puzzle.ts';
import { showToast } from '@devvit/web/client';
import { getApi, isMock } from './api.ts';
import { Board } from './Board.tsx';
import { ResultCard } from './ResultCard.tsx';

const toast = (text: string) => {
  if (isMock) {
    console.log('[toast]', text);
    return;
  }
  showToast(text);
};

const SEEN_KEY = 'lanternlight:onboarded';
const seenBefore = () => {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
};

type Phase = 'loading' | 'error' | 'playing' | 'won' | 'results';

export const App = () => {
  const [state, setState] = useState<StateResponse | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const [mirrors, setMirrors] = useState<Mirror[]>([]);
  const [spins, setSpins] = useState<number[]>([]);
  const [moves, setMoves] = useState<number[]>([]);
  const [shake, setShake] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [done, setDone] = useState<CompleteResponse | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [shared, setShared] = useState(false);
  const [onboarded, setOnboarded] = useState(seenBefore);
  const completing = useRef(false);

  const reset = useCallback((s: StateResponse) => {
    setMirrors(s.puzzle.start.slice());
    setSpins(s.puzzle.start.map(() => 0));
    setMoves([]);
    completing.current = false;
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const api = await getApi();
        const s = await api.state();
        setState(s);
        reset(s);
        if (s.result) {
          setPhase('results');
        } else {
          const { startedAt: t } = await api.start();
          setStartedAt(t);
          setPhase('playing');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase('error');
      }
    })();
  }, [reset]);

  useEffect(() => {
    if (phase !== 'playing' || replaying) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [phase, replaying]);

  const puzzle = state?.puzzle;
  const beam = useMemo(() => (puzzle ? trace(puzzle, mirrors) : null), [puzzle, mirrors]);
  const solved = !!puzzle && !!beam && beam.lit.size === puzzle.lanterns && mirrors.length > 0;

  // celebrate, then submit
  useEffect(() => {
    if (!solved || !state || phase !== 'playing' || completing.current) return;
    completing.current = true;
    setPhase('won');
    try {
      navigator.vibrate?.([20, 40, 30]);
    } catch {
      /* not supported */
    }
    void (async () => {
      const wait = new Promise((r) => setTimeout(r, 1900));
      try {
        if (replaying) {
          await wait;
          setPhase('results');
          return;
        }
        const api = await getApi();
        const [res] = await Promise.all([api.complete(moves), wait]);
        setDone(res);
        setPhase('results');
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not save your result');
        completing.current = false;
        setPhase('playing');
      }
    })();
  }, [solved, state, phase, moves, replaying]);

  const tap = useCallback(
    (id: number) => {
      if (!puzzle || phase !== 'playing') return;
      const cell = puzzle.cells.find((c) => c.kind === 'mirror' && c.id === id);
      if (!cell || cell.kind !== 'mirror') return;
      if (cell.locked) {
        setShake(id);
        setTimeout(() => setShake(null), 400);
        toast('That mirror is bolted in place');
        return;
      }
      try {
        navigator.vibrate?.(8);
      } catch {
        /* not supported */
      }
      setMirrors((m) => m.map((v, i) => (i === id ? flip(v) : v)));
      setSpins((s) => s.map((v, i) => (i === id ? v + 1 : v)));
      setMoves((m) => [...m, id]);
      if (!onboarded) {
        setOnboarded(true);
        try {
          localStorage.setItem(SEEN_KEY, '1');
        } catch {
          /* storage blocked */
        }
      }
    },
    [puzzle, phase, onboarded]
  );

  const share = useCallback(async () => {
    try {
      const api = await getApi();
      const r = await api.share();
      if (r.ok) setShared(true);
      toast(r.message);
    } catch {
      toast('Could not share right now');
    }
  }, []);

  if (phase === 'loading' || !state || !puzzle || !beam) {
    return (
      <div className="screen center">
        {phase === 'error' ? (
          <p className="muted">The lanterns won’t light: {error}</p>
        ) : (
          <div className="loader" aria-label="Loading">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
    );
  }

  const result = done?.result ?? state.result;
  const showCard = phase === 'results' && result;
  const elapsed = replaying ? 0 : Math.max(0, now - startedAt);
  const sec = Math.floor(elapsed / 1000);
  const lanternsLit = beam.lit.size;
  const overPar = moves.length > puzzle.par;

  return (
    <div className="screen">
      <div className="sky" aria-hidden>
        {Array.from({ length: 28 }, (_, i) => (
          <span key={i} className="star-dot" style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 60}%`, animationDelay: `${(i % 9) * 0.4}s` }} />
        ))}
      </div>

      <header className="hud">
        <div>
          <h1 className="title">
            Lanternlight <span className="num">#{puzzle.day}</span>
          </h1>
          <p className="subtitle">
            {state.weekday} · {state.difficulty} · {puzzle.size}×{puzzle.size}
            {state.puzzle.day !== state.today && <> · archive</>}
          </p>
        </div>
        <div className="counters">
          <div className={`counter ${overPar ? 'over' : ''}`}>
            <span className="counter-n">{moves.length}</span>
            <span className="counter-l">taps · par {puzzle.par}</span>
          </div>
          {!replaying && !state.result && (
            <div className="counter">
              <span className="counter-n">
                {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, '0')}
              </span>
              <span className="counter-l">time</span>
            </div>
          )}
        </div>
      </header>

      <main className="stage">
        <Board
          puzzle={puzzle}
          mirrors={mirrors}
          spins={spins}
          trace={beam}
          solved={phase !== 'playing'}
          released={phase === 'won' || phase === 'results'}
          hint={!onboarded && moves.length === 0}
          shake={shake}
          onTap={tap}
        />
      </main>

      <footer className="foot">
        <div className="pips" aria-label={`${lanternsLit} of ${puzzle.lanterns} lanterns lit`}>
          {Array.from({ length: puzzle.lanterns }, (_, i) => (
            <span key={i} className={i < lanternsLit ? 'pip on' : 'pip'} />
          ))}
        </div>
        <p className="helper">
          {phase === 'won'
            ? 'The lanterns rise…'
            : !onboarded && moves.length === 0
              ? 'Tap a mirror to turn it. Guide the light to every lantern.'
              : replaying
                ? 'Replay — just for fun'
                : beam.looped
                  ? 'The light is chasing its tail'
                  : `${lanternsLit} of ${puzzle.lanterns} lit · every tap counts`}
        </p>
      </footer>

      {showCard && (
        <div className="overlay">
          <ResultCard
            day={puzzle.day}
            today={state.today}
            par={puzzle.par}
            result={result}
            stats={done?.stats ?? state.stats}
            community={done?.community ?? state.community}
            leaders={done?.leaders ?? state.leaders}
            username={state.username}
            firstSolve={done?.firstSolve ?? false}
            shared={shared}
            onShare={share}
            onReplay={() => {
              reset(state);
              setReplaying(true);
              setPhase('playing');
            }}
          />
        </div>
      )}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
