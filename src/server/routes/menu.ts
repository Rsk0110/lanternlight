import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { createDailyPost, subredditPostUrl, todayNumber } from '../core/post.ts';

export const menu = new Hono();

menu.post('/post-today', async (c) => {
  try {
    const { id, created } = await createDailyPost(todayNumber());
    return c.json<UiResponse>(
      created ? { navigateTo: subredditPostUrl(id) } : { showToast: 'Today’s Lanternlight is already posted', navigateTo: subredditPostUrl(id) },
      200
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<UiResponse>({ showToast: 'Failed to create post' }, 400);
  }
});
