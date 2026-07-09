# ScaleMyLife

Turn your real life into an RPG. Do the work — tasks, habits, focused study — and earn XP, coins, ranks and loot. Spend coins on real rewards you actually want, guilt-free, because you earned them.

ScaleMyLife is a fast, offline-capable web app (a PWA). It installs to a phone home screen, works without a connection after first load, and needs no setup to try. Accounts and cross-device sync are on the roadmap; today each device keeps its own save (export/import a JSON backup to move between devices).

## How to run

- **Try it instantly:** open `index.html` in a browser and create your hero.
- **Host it:** it's plain static files — deploy the folder to Netlify, Vercel or GitHub Pages and share a public URL.
- **Install on a phone:** once hosted, Android Chrome shows an "Install" prompt; on iPhone use Safari → Share → "Add to Home Screen". It runs fullscreen and works offline.

Saves live in the browser (localStorage). Export a JSON backup now and then (⚙️ → Export). Old LiFE RPG saves migrate automatically.

## Start here

First launch runs a short, skippable tutorial, then **Create your hero**: name, avatar, and a **starting path** (Student, Athlete, Founder, Creative or Balanced) that tailors your opening quests, habits, life areas and rewards so you never stare at an empty board. Everything is editable afterwards. The app opens on the **Today** tab.

## The core loop

Work earns coins, coins buy pleasures. A solid day (dailies + habits + 2 focus blocks + journal/sleep) earns ~90–110 💰. Gaming 1h costs 60.

- **Main quests** — big goals, broken into steps inside the card; the bar fills as you clear them. 300xp / 150💰 on completion.
- **Daily quests** — recurring, reset at midnight. Clear them all → **daily chest**. You can also **schedule** a daily to specific weekdays (e.g. gym Mon/Wed/Fri); off-day dailies sit dormant and don't block the chest.
- **Side quests** — one-offs. Give them due dates to line up in **Deadlines**, export them as an **.ics calendar** file, or promote one (⬆) into a main quest.
- **Focus (pomodoro)** — 25/5, 50/10, 90/15 or free run, looping until you stop. You're paid for every worked minute (1.2xp + 0.6💰/min). Breaks show a campfire and heal +3 ❤️. Optional study music (Lofi/synthwave/any YouTube URL).
- **Habits** — good habits pay xp/coins, refresh daily, and show a 7-day chain; set a weekly frequency (gym 3×/week) for week progress + a streak of weeks met.
- **Deadlines, KO & wounds, Streak Shield, Weekly boss** — as before: hit 0 ❤️ and you respawn wounded (XP halved for the day); a Streak Shield auto-saves one missed day; name THE task of the week and slay it within 7 days for 500xp / 250💰.

## Progression & retention

- **Ranks** — E→SS, with a full celebration on rank-up. At rank **S / SS** the interface shifts into **Legend mode** — a refined, gilded look with an animated avatar aura.
- **Skill mastery** — each life area you tag work to levels up and unlocks a tier: **Adept** (Lv.3, +10% XP), **Expert** (Lv.6, +20%), **Master** (Lv.10, +30% XP & +10% coins) on that area's actions. Specializing pays off.
- **Daily chest loot** — most opens give coins, but rare drops include a **coin jackpot**, a **Focus Elixir** (×2 XP for a day), or a **cosmetic avatar frame**.
- **Ascension (prestige / seasons)** — at rank S you can **ascend**: reset your level and rank for a fresh climb while keeping coins, quests, habits, streak, titles, badges and cosmetics. Each season grants a **permanent boon** that stacks: Scholar (+8% XP), Coinfinder (+8% coins), Vigor (+20 max HP), Warden (monsters hit 20% softer) or Fortune (better chest loot).
- **Monster menace** — bad habits are monsters that scale. Keep feeding one and its menace rises, so it hits harder; stay clean and it calms back down. Warden softens every monster.
- **Wearable titles & cosmetics** — achievements unlock titles you can wear; chest frames glow around your avatar.

## Insight layer

The **Stats** tab now does more than count XP:

- **Week in review** — your best day, your toughest monster of the week, and a concrete suggestion for next week (ideal for Friday planning).
- **Insights** — plain-language patterns computed from data you already log: how sleep, focus and slips track with your mood ("On your best-mood days you sleep 1.3h more"). It needs a few days of mood entries before it speaks up, and it never invents a pattern that isn't there.

Plus the existing weekly XP chart, mood strip, achievements and adventure log.

## Files

`index.html` (markup) · `styles.css` (styles) · `app.js` (UI logic) · `core.js` (game engine, no DOM) · `sw.js` + `manifest.json` + icons (PWA) · `test.js` + `test-ui.js` (391 tests).

## Development

```
npm install   # dev dependency: jsdom (for the UI tests)
npm test      # runs test.js (engine) + test-ui.js (full UI flow in jsdom)
npm start     # serves it locally
```

No build step — plain static files. All payouts, prices, curves, prestige boons, skill tiers and onboarding paths are constants at the top of `core.js`.

## Roadmap

Accounts + cloud sync (so one save follows you across devices) is the natural next step and would open the door to a hosted, sellable product. It needs a small backend (e.g. Supabase) — a real project for later. Everything above runs today with zero backend.
