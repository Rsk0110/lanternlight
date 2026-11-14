import { Hono } from 'hono';
import type { TriggerResponse } from '@devvit/web/shared';
import { createDailyPost, todayNumber } from '../core/post.ts';

export const triggers = new Hono();

// Post today's puzzle as soon as the app is installed; the cron task covers every day after.
triggers.post('/on-app-install', async (c) => {
  try {
    const { id } = await createDailyPost(todayNumber());
    return c.json<TriggerResponse>({ status: 'success', message: `Daily post ${id}` }, 200);
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<TriggerResponse>({ status: 'error', message: 'Failed to create post' }, 400);
  }
});
