import { Hono } from 'hono';
import type { Context as HonoContext } from 'hono';
import { context, reddit, redis } from '@devvit/web/server';
import type {
  CompleteRequest,
  CompleteResponse,
  ErrorResponse,
  ShareResponse,
  StartResponse,
  StateResponse,
  SummaryResponse,
} from '../../shared/api.ts';
import { completeDay, GameError, getState, getSummary, puzzleFor, shareText, startDay } from '../../shared/game.ts';
import { dayForContext, todayNumber } from '../core/post.ts';

export const api = new Hono();

const fail = (c: HonoContext, message: string, status: 400 | 500 = 400) =>
  c.json<ErrorResponse>({ type: 'error', message }, status);

const currentUser = async (): Promise<string | null> => (await reddit.getCurrentUsername()) ?? null;

api.get('/summary', async (c) => {
  try {
    return c.json<SummaryResponse>(await getSummary(redis, dayForContext(), todayNumber(), await currentUser()));
  } catch (e) {
    console.error('summary failed', e);
    return fail(c, 'Could not load today’s puzzle', 500);
  }
});

api.get('/state', async (c) => {
  try {
    return c.json<StateResponse>(await getState(redis, dayForContext(), todayNumber(), await currentUser()));
  } catch (e) {
    console.error('state failed', e);
    return fail(c, 'Could not load the puzzle', 500);
  }
});

api.post('/start', async (c) => {
  const startedAt = await startDay(redis, dayForContext(), await currentUser(), Date.now());
  return c.json<StartResponse>({ type: 'start', startedAt });
});

api.post('/complete', async (c) => {
  try {
    const body = await c.req.json<CompleteRequest>();
    const res = await completeDay(redis, dayForContext(), todayNumber(), await currentUser(), body.moves, Date.now());
    return c.json<CompleteResponse>(res);
  } catch (e) {
    if (e instanceof GameError) return fail(c, e.message);
    console.error('complete failed', e);
    return fail(c, 'Could not save your result', 500);
  }
});

// Posts the player's result card as a comment from their own account.
api.post('/share', async (c) => {
  const user = await currentUser();
  const postId = context.postId;
  if (!user || !postId) return c.json<ShareResponse>({ type: 'share', ok: false, message: 'Log in to share' });
  const day = dayForContext();
  const state = await getState(redis, day, todayNumber(), user);
  if (!state.result) return c.json<ShareResponse>({ type: 'share', ok: false, message: 'Solve it first!' });
  const sharedKey = `d:${day}:shared:${user}`;
  if (await redis.get(sharedKey)) return c.json<ShareResponse>({ type: 'share', ok: false, message: 'Already shared today' });
  try {
    await reddit.submitComment({
      id: postId,
      text: shareText(day, state.result, puzzleFor(day).par, state.stats.streak),
      runAs: 'USER',
    });
    await redis.set(sharedKey, '1');
    return c.json<ShareResponse>({ type: 'share', ok: true, message: 'Shared to the comments' });
  } catch (e) {
    console.error('share failed', e);
    return c.json<ShareResponse>({ type: 'share', ok: false, message: 'Could not post comment' });
  }
});
