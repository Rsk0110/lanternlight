import { useEffect, useState } from 'react';
import type { Community, DayResult, LeaderRow, PlayerStats } from '../shared/api.ts';
import { formatTime } from '../shared/game.ts';
import { dateFromDay } from '../shared/puzzle.ts';

type Props = {
  day: number;
  today: number;
  par: number;
  result: DayResult;
  stats: PlayerStats;
  community: Community;
  leaders: LeaderRow[];
  username: string | null;
  firstSolve: boolean;
  shared: boolean;
  onShare: () => void;
  onReplay: () => void;
};

const useCountdown = (day: number) => {
  const target = dateFromDay(day + 1).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, target - now);
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
};

export const ResultCard = (p: Props) => {
  const [tab, setTab] = useState<'you' | 'top'>('you');
  const countdown = useCountdown(p.today);
  const diff = p.result.taps - p.par;
  const headline = diff < 0 ? 'Better than par!' : diff === 0 ? 'Perfect — right on par' : diff <= 2 ? 'Lanterns lit!' : 'Every lantern glows';
  const maxBar = Math.max(1, ...p.community.histogram);
  const yourBucket = Math.min(p.community.histogram.length - 1, Math.max(0, diff));

  return (
    <div className="card" role="dialog" aria-label="Your result">
      <div className="card-stars" aria-label={`${p.result.stars} of 3 stars`}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={i < p.result.stars ? 'star on' : 'star'} style={{ animationDelay: `${200 + i * 160}ms` }}>
            ★
          </span>
        ))}
      </div>
      <h2 className="card-title">{headline}</h2>
      <p className="card-sub">
        <b>{p.result.taps}</b> taps · par {p.par} {p.result.ms > 0 && <>· {formatTime(p.result.ms)}</>}
        {p.result.rank > 0 && (
          <>
            {' '}
            · <b>#{p.result.rank}</b> of {p.community.solvers}
          </>
        )}
      </p>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'you'} className={tab === 'you' ? 'tab on' : 'tab'} onClick={() => setTab('you')}>
          Everyone
        </button>
        <button role="tab" aria-selected={tab === 'top'} className={tab === 'top' ? 'tab on' : 'tab'} onClick={() => setTab('top')}>
          Top lamplighters
        </button>
      </div>

      {tab === 'you' ? (
        <div className="hist" aria-label="How everyone did">
          {p.community.histogram.map((n, i) => (
            <div key={i} className="hist-row">
              <span className="hist-label">{i === 0 ? 'Par' : i === p.community.histogram.length - 1 ? `+${i}…` : `+${i}`}</span>
              <span className="hist-track">
                <span
                  className={`hist-bar ${i === yourBucket && p.result.rank > 0 ? 'you' : ''}`}
                  style={{ width: `${Math.max(4, (n / maxBar) * 100)}%` }}
                />
              </span>
              <span className="hist-n">{n}</span>
            </div>
          ))}
          <p className="hist-note">
            {p.community.solvers > 0
              ? `${Math.round(p.community.parRate * 100)}% of ${p.community.solvers} players hit par`
              : 'You’re the first to light them all tonight'}
          </p>
        </div>
      ) : (
        <ol className="leaders">
          {p.leaders.length === 0 && <li className="leader empty">No solvers yet</li>}
          {p.leaders.map((r) => (
            <li key={r.username} className={`leader ${r.username === p.username ? 'me' : ''}`}>
              <span className="leader-rank">{r.rank}</span>
              <span className="leader-name">u/{r.username}</span>
              <span className="leader-taps">{r.taps} taps</span>
              <span className="leader-time">{formatTime(r.ms)}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="streak-row">
        <div className="streak-box">
          <span className="streak-n">{p.stats.streak}</span>
          <span className="streak-l">day streak</span>
        </div>
        <div className="streak-box">
          <span className="streak-n">{p.stats.bestStreak}</span>
          <span className="streak-l">best</span>
        </div>
        <div className="streak-box">
          <span className="streak-n">{p.stats.played}</span>
          <span className="streak-l">played</span>
        </div>
        <div className="streak-box">
          <span className="streak-n">{p.stats.played ? Math.round((p.stats.parOrBetter / p.stats.played) * 100) : 0}%</span>
          <span className="streak-l">at par</span>
        </div>
      </div>

      <div className="card-actions">
        {p.username ? (
          <button className="btn primary" onClick={p.onShare} disabled={p.shared}>
            {p.shared ? 'Shared ✓' : 'Share result in comments'}
          </button>
        ) : (
          <p className="hist-note">Log in to Reddit to save streaks and join the leaderboard.</p>
        )}
        <button className="btn ghost" onClick={p.onReplay}>
          Replay (won’t change your score)
        </button>
      </div>
      <p className="next">{p.day === p.today ? <>Next puzzle in {countdown}</> : <>Today’s puzzle is #{p.today} — find it in the subreddit</>}</p>
    </div>
  );
};
