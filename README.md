# Lanternlight

A daily light-puzzle for Reddit, built on Devvit Web.

One beam of moonlight enters the board. Tap mirrors to turn them and guide the light through every paper lantern. Every tap counts, and par is the true minimum. When the last lantern catches, they all float up into the night sky.

A new puzzle is posted to the subreddit every day at 00:00 UTC. Difficulty climbs through the week, from **Gentle** Monday (5×5) to **Midnight** Sunday (8×8).

## How to play

- Tap a mirror to turn it 90°.
- The beam updates live. Light every lantern to win.
- Mirrors with a brass pin are bolted in place. Rocks swallow the light.
- Score = taps (fewer is better), then time. Matching par earns ★★★.

## What makes it daily and social

- **One shared puzzle per day.** Each puzzle is generated deterministically from the date and posted by the app's scheduler. Old posts stay playable as an archive.
- **A provably fair par.** An exhaustive solver checks every reachable mirror arrangement, so par is always the real minimum, never a guess.
- **Server-verified results.** The client sends its tap sequence. The server replays it, checks that every lantern is lit, and times the solve from when the puzzle was opened.
- **Community view.** After solving you see how everyone did (distribution vs. par), the day's top players, your rank, streak, best streak, and your at-par rate.
- **Share to comments.** One tap posts a spoiler-free result card to the thread from your own account:
  ```
  Lanternlight #12 — ★★☆
  5 taps (par +1) in 1:23 · #4 today
  3-day streak
  ```

## Tech

- Devvit Web: React 19 + Tailwind 4 client, Hono server, Redis for storage, Scheduler for the daily post.
- `src/shared/puzzle.ts`: seeded generator, beam tracer, exact solver.
- `src/shared/game.ts`: rules, streaks, leaderboard and histogram, written against a tiny store interface so they run on Redis or in memory.
- `src/server`: API routes, a moderator menu item, the install trigger, and the daily cron.
- `src/client`: inline splash (feed) and expanded game view. SVG board, animated beam, haptics, reduced-motion support, keyboard play.

## Develop

```bash
npm install
npm run login       # connect the CLI to your Reddit account
npm run dev         # devvit playtest on your test subreddit
npm run test:unit   # generator, solver and game-rule tests
npm run build && npx serve dist/client   # open game.html?mock to play offline
```

`?mock` runs the full game against an in-browser store with seeded community results, for UI work and demo recording outside Reddit.

## AI disclosure

This project was built with Claude (Anthropic) as a coding assistant: design, puzzle generator and solver, server and client code, and tests.

## License

BSD-3-Clause
