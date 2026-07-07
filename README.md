# ScaleMyLife

Your life as an RPG, running entirely on your machine. No account, no internet needed.

## How to run

1. Unzip anywhere. 2. Double-click **index.html**. 3. Create your hero.

Save lives in that browser (localStorage) — use the same browser each time, and export a JSON backup now and then (⚙️ → Export). Old LiFE RPG saves migrate automatically.

## Start here

First launch opens a 4-step tutorial (skippable, replayable from ⚙️). The app opens on the **Today** tab: your dailies, habit checks, urgent deadlines, chest and quick actions in one screen.

## The loop

Work earns coins, coins buy pleasures. A solid day (dailies + habits + 2 focus blocks + journal/sleep) earns ~90–110 💰. Gaming 1h costs 60.

- **Main quests** — the big goals, top of the Quests tab. Break them into steps directly inside the card; the progress bar fills as you clear them. 300xp/150💰 on completion.
- **Daily quests** — recurring, reset at midnight automatically (a "new day" toast confirms it). Clear them all → **daily chest** (20–50 bonus 💰).
- **Side quests** — loose one-offs. Quests with due dates can be exported as an **.ics calendar file** (📅 button) and imported into Apple/Google Calendar for phone reminders.
- **Focus (pomodoro)** — pick 25/5, 50/10, 90/15 or free run. Cycles loop until YOU stop; you're paid for every worked minute (1.2xp + 0.6💰/min) when you hit Stop & collect. Breaks show a campfire rest scene and heal +3 ❤️. Optional study music/video: Lofi Girl, synthwave radio, or paste any YouTube URL (needs internet). Opened as a local file, YouTube blocks embeds (error 153), so the app gives you a pop-out player window instead; once hosted online, the video embeds directly under the timer. Sessions under 5 min pay nothing; payout capped at 4h.
- **Habits** — good habits pay xp/coins, refresh every morning, and show a 7-day dot chain. Set a weekly frequency (e.g. gym 3×/week): the row shows week progress and a streak of consecutive weeks met. Bad habits are monsters: a slip costs 12 ❤️/10 💰; your best clean run is kept as a record.
- **Deadlines** — side quests with due dates line up in the Deadlines panel grouped by urgency (overdue / today / this week / later), and overdue work is surfaced on the Today tab. The ⬆ button on any side quest upgrades it into a main quest.
- **KO & wounds** — hitting 0 ❤️ knocks you out: you respawn at 25 HP and are *wounded* for the day (all XP halved) until you rest at the Hotel, log good sleep, or a new day starts.
- **Streak Shield** — buy it in the Market (200💰, carry max 1). If you miss a full day, it's consumed automatically and your hero streak survives.
- **Weekly boss** — name THE task of the week (ideal on Friday planning). Slay it within 7 days for 500xp/250💰 and a kill screen; let it linger and it escapes. One boss at a time.
- **Wearable titles** — achievements unlock titles. In the character screen, tap an earned title (Dragonheart, Monk Mode, Centurion…) to wear it under your name.
- **Ranks** — E→SS. Ranking up triggers a full celebration: giant rank letter, gold confetti, fanfare. The HUD shows your next rank target, and your avatar frame is colored by rank.
- **Character** — click your avatar: name, custom title, 24 avatars or any emoji you type, and 5 color themes (Dungeon, Synthwave, Forest, Crimson, Ocean).
- **Stats** — weekly review, xp chart, mood strip, 16 achievements, adventure log.

- **Black Market** — breaking your own rules is purchasable, but it costs coins AND HP (it can even knock you out). Market = earned pleasures, Hotel = recovery, Black Market = paid sins.

## Files

`index.html` (markup) · `styles.css` (styles) · `app.js` (UI logic) · `core.js` (game engine, no DOM) · `sw.js` + `manifest.json` + icons (PWA) · `test.js` + `test-ui.js` (296 tests)

## Development

```
npm install   # dev dependency: jsdom (for the UI tests)
npm test      # runs test.js (engine) + test-ui.js (full UI flow in jsdom)
```

No build step — the app is plain static files. `npm start` serves it locally.

## Tuning

All payouts, prices and curves are constants at the top of `core.js`.

## Phone installation (PWA)

Once hosted (see below), the app installs on a phone home screen like a native app: on Android, Chrome shows an "Install" prompt; on iPhone, Safari → Share → "Add to Home Screen". It runs fullscreen with its own icon and works offline after the first visit (service worker caches everything). Opening index.html locally ignores all of this harmlessly.

## Going online

The whole app is static files, so free hosting works: drag the folder into Netlify (netlify.com → "Deploy manually") or push to GitHub and enable GitHub Pages. You get a public URL in minutes, free. Every visitor gets their OWN independent save (localStorage is per-device) — great for sharing the tool, but there are no accounts and your save doesn't sync between your devices (use Export/Import JSON for that). Accounts + sync would need a backend (e.g. Supabase free tier) — a real project for later.
