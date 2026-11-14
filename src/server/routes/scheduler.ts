import { Hono } from 'hono';
import { createDailyPost, todayNumber } from '../core/post.ts';

export const scheduler = new Hono();

// Runs at 00:00 UTC (devvit.json cron) and publishes the new day's puzzle.
scheduler.post('/daily-post', async (c) => {
  try {
    const { id, created } = await createDailyPost(todayNumber());
    console.log(`daily-post ${created ? 'created' : 'exists'} ${id}`);
    return c.json({}, 200);
  } catch (e) {
    console.error('daily-post failed', e);
    return c.json({}, 500);
  }
});
