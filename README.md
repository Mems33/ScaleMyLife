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
- **Market with anti-binge pricing** — buy rewards you actually want. To stop a coin hoard from funding unlimited indulgence, repeat purchases of the same reward *the same day* cost progressively more (a soft cap you can toggle off), and Black-Market rule-breaking is hard-capped at 2×/day. Rest/Hotel items never surge. Every reward's per-day cap is editable.
- **Habits** — good habits pay xp/coins, refresh daily, and show a 7-day chain; set a weekly frequency (gym 3×/week) for week progress + a streak of weeks met.
- **Deadlines, KO & wounds, Streak Shield, Weekly boss** — as before: hit 0 ❤️ and you respawn wounded (XP halved for the day); a Streak Shield auto-saves one missed day; name THE task of the week and slay it within 7 days for 500xp / 250💰.

## Progression & retention

- **Ranks** — E→SS, with a full celebration on rank-up. At rank **S / SS** the interface shifts into **Legend mode** — a refined, gilded look with an animated avatar aura.
- **Skill mastery** — each life area you tag work to levels up (level itself is uncapped) and unlocks a tier: **Adept** (Lv.3, +10% XP), **Expert** (Lv.6, +20%), **Master** (Lv.10, +30% XP & +10% coins), **Grandmaster** (Lv.15, +40%/+15%) and **Sage** (Lv.20, +50%/+20%). The bonus plateaus at Sage so a maxed area can't run away with the economy; the level keeps climbing for bragging rights.
- **Daily chest loot** — most opens give coins, but rare drops include a **coin jackpot**, a **Focus Elixir** (×2 XP for a day), or a **cosmetic avatar frame**.
- **Ascension (prestige / seasons)** — at rank S you can **ascend**: reset your level and rank for a fresh climb while keeping coins, quests, habits, streak, titles, badges and cosmetics. Each season grants a **permanent boon** that stacks: Scholar (+8% XP), Coinfinder (+8% coins), Vigor (+20 max HP), Warden (monsters hit 20% softer) or Fortune (better chest loot).
- **Monster menace** — bad habits are monsters that scale. Keep feeding one and its menace rises, so it hits harder; stay clean and it calms back down. Warden softens every monster.
- **Wearable titles & cosmetics** — achievements unlock titles you can wear; chest frames glow around your avatar.

## Insight layer

The **Stats** tab now does more than count XP:

- **Week in review** — your best day, your toughest monster of the week, and a concrete suggestion for next week (ideal for Friday planning).
- **Insights** — plain-language patterns computed from data you already log: how sleep, focus and slips track with your mood ("On your best-mood days you sleep 1.3h more"). It needs a few days of mood entries before it speaks up, and it never invents a pattern that isn't there.

Plus the existing weekly XP chart, mood strip, achievements and adventure log.

## Look & feel

Dark, game-flavoured, and deliberately not generic. A hand-written **WebGL shader gradient** (`gradient.js`) drifts slowly behind the app — a self-contained, dependency-free take on the "mesh gradient" look, tinted live by your chosen theme. It's a progressive enhancement: if WebGL is missing it hides itself and a CSS aurora fallback takes over, it renders a single static frame under `prefers-reduced-motion`, pauses when the tab is hidden, and runs at ~30fps with a capped pixel-ratio to stay light on phones. Surfaces use translucent "machined" panels with soft inset highlights and coloured hover glows; blur is reserved for fixed overlays (never large scrolling content) to keep mobile smooth.

## Files

`index.html` (markup) · `styles.css` (styles) · `app.js` (UI logic) · `core.js` (game engine, no DOM) · `gradient.js` (WebGL background) · `sw.js` + `manifest.json` + icons (PWA) · `test.js` + `test-ui.js` (426 tests).

## Development

```
npm install   # dev dependency: jsdom (for the UI tests)
npm test      # runs test.js (engine) + test-ui.js (full UI flow in jsdom)
npm start     # serves it locally
```

No build step — plain static files. All payouts, prices, curves, prestige boons, skill tiers and onboarding paths are constants at the top of `core.js`.

## Roadmap

Accounts + cloud sync (so one save follows you across devices) is the natural next step and would open the door to a hosted, sellable product. It needs a small backend (e.g. Supabase) — a real project for later. Everything above runs today with zero backend.
