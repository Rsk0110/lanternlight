import { context, reddit, redis } from '@devvit/web/server';
import { dayFromDate, weekdayName } from '../../shared/puzzle.ts';
import { postKeyForDay, puzzleFor } from '../../shared/game.ts';
import { difficultyFor } from '../../shared/puzzle.ts';

export const todayNumber = (): number => Math.max(1, dayFromDate(new Date()));

// Which daily puzzle this post shows. Posts carry their day in postData; any
// legacy/unknown post falls back to today's puzzle.
export const dayForContext = (): number => {
  const raw = context.postData?.['day'];
  const day = typeof raw === 'number' ? raw : Number(raw);
  return Number.isInteger(day) && day >= 1 ? day : todayNumber();
};

export const postTitle = (day: number): string =>
  `Lanternlight #${day} · ${weekdayName(day)} · ${difficultyFor(day).label}`;

// Idempotent: one post per day per subreddit.
export const createDailyPost = async (day: number): Promise<{ id: string; created: boolean }> => {
  const existing = await redis.get(postKeyForDay(day));
  if (existing) return { id: existing, created: false };
  const p = puzzleFor(day);
  const post = await reddit.submitCustomPost({
    title: postTitle(day),
    entry: 'default',
    postData: { day },
    textFallback: {
      text: `Lanternlight #${day}: turn the mirrors so one beam of light reaches every lantern. Par is ${p.par} taps. Open this post on new Reddit or the app to play.`,
    },
  });
  await redis.set(postKeyForDay(day), post.id);
  return { id: post.id, created: true };
};

export const subredditPostUrl = (postId: string): string =>
  `https://reddit.com/r/${context.subredditName}/comments/${postId.replace(/^t3_/, '')}`;
