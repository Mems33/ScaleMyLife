# ScaleMyLife

Turn your real life into an RPG. Do the work — tasks, habits, focused study — and earn XP, coins, ranks and loot. Spend coins on real rewards you actually want, guilt-free, because you earned them.

ScaleMyLife is a fast, offline-capable web app (a PWA). It installs to a phone home screen, works without a connection after first load, and needs no setup to try. **Cloud sync is built in**: create a free account (Supabase-backed) and your save follows you across devices; without an account each device keeps its own save (export/import a JSON backup any time).

## How to run

- **Try it instantly:** open `index.html` in a browser and create your hero.
- **Host it:** it's plain static files — deploy the folder to Netlify, Vercel or GitHub Pages and share a public URL.
- **Install on a phone:** once hosted, Android Chrome shows an "Install" prompt; on iPhone use Safari → Share → "Add to Home Screen". It runs fullscreen and works offline.

Saves live in the browser (localStorage) and — once you sign in — in your cloud account too. Old LiFE RPG saves migrate automatically.

## Cloud sync (Supabase)

One `saves` row per user, protected by Postgres Row Level Security, talked to by a hand-rolled zero-dependency REST client (`cloud.js` — no SDK, no build step). Email/password accounts; the app pushes your save a few seconds after every change and pulls the newer side on boot. Signing in on a second device asks which save wins. Sessions and the API key live outside the save file, so exports never leak credentials.

Setting it up for your own deployment:
1. In the Supabase dashboard run `supabase/schema.sql` (SQL Editor → paste → Run).
2. Authentication → Sign In / Up → disable "Confirm email" (or set your Site URL so confirmation links land on your domain).
3. Paste the **publishable (anon) key** into `PUBLISHABLE_KEY` in `cloud.js` — or just paste it once in ⚙️ Settings, which stores it in the browser. The key is public by design; RLS is the security boundary.

## Start here

First launch runs a short, skippable primer, then **Create your hero**: name, avatar, and a **starting path** (Student, Athlete, Founder, Creative or Balanced) that tailors your opening quests, habits, life areas and rewards so you never stare at an empty board. A new hero is then walked through an **interactive spotlight tour** that dims the screen and points at the real controls one by one (re-runnable any time from ⚙️ → Interactive tour). Everything you add is editable — every quest, main quest and habit has a ✎ button. The app opens on the **Today** tab.

## The core loop

Work earns coins, coins buy pleasures. A solid day (dailies + habits + 2 focus blocks + journal/sleep) earns ~90–110 💰. Gaming 1h costs 60.

- **Main quests** — big goals, broken into steps inside the card; the bar fills as you clear them. 300xp / 150💰 on completion.
- **Daily quests** — recurring, reset at midnight. Clear them all → **daily chest**. You can also **schedule** a daily to specific weekdays (e.g. gym Mon/Wed/Fri); off-day dailies sit dormant and don't block the chest.
- **Side quests** — one-offs. Give them due dates to line up in **Deadlines**, export them as an **.ics calendar** file, or promote one (⬆) into a main quest.
- **Focus (pomodoro)** — 25/5, 50/10, 90/15 or free run, looping until you stop. You're paid for every worked minute (1.2xp + 0.6💰/min). Breaks show a campfire and heal +3 ❤️. Optional study music (Lofi/synthwave/any YouTube URL). Attach a session to a **main quest** and the worked time is banked on that goal's card.
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

- **Focus by life area** — a per-day stacked breakdown of *what you actually worked on*, with a **Week / Month toggle**: each focus session is tagged to a life area, then charted so you can see where your deep-work hours really went.
- **Consistency heatmap** — a GitHub-style wall of the last 12 weeks; every day you earn XP lights a square. Nothing motivates like not breaking the wall.
- **Share my week** — one tap renders your week (rank, level, XP, quests, focus hours, streak, mood strip) into a polished 1080×1080 image and opens the native share sheet (or downloads the PNG). Your progress, postable anywhere.
- **Trophy shelf** — every weekly boss you've ever slain, with the date of the kill.
- **Week in review** — your best day, your toughest monster of the week, and a concrete suggestion for next week (ideal for Friday planning).
- **Insights** — plain-language patterns computed from data you already log: how sleep, focus and slips track with your mood ("On your best-mood days you sleep 1.3h more"). It needs a few days of mood entries before it speaks up, and it never invents a pattern that isn't there.

Plus the existing weekly XP chart, mood strip, achievements and adventure log. The HUD shows a **today-at-a-glance** line (XP, coins, focus time earned since midnight).

## Leaderboard (opt-in)

Race other heroes on **weekly XP**. Strictly opt-in from ⚙️ → Cloud sync: joining shares only your name, avatar, level, rank, weekly XP and best streak — never your save — and leaving deletes your row entirely (row existence *is* the opt-in; see `supabase/leaderboard.sql`). Top 25 shown in Stats with your row highlighted. Degrades gracefully if the table isn't set up yet.

## Friends (private board)

Add specific people by a short **friend code** and race them on a private board — no need to join the public leaderboard. Enable from ⚙️ → Cloud sync → *Enable friends* (requires an account): you get an 8-character code to share, and paste a friend's code to add them. The Stats leaderboard gains a **Global / Friends** toggle so you can flip between the world and just your crew.

It's privacy-first and one-directional: adding someone lets *you* see their public profile card (name, avatar, level, rank, weekly XP, best streak — never their save), and Postgres Row Level Security gates every read so a profile is only visible to itself, to the people who've added it, or to anyone who's on the global board. Codes are looked up through a `SECURITY DEFINER` function (callable only by signed-in users) so you can add a friend before either of you follows the other. Run `supabase/friends.sql` once to enable it; the app degrades gracefully if you haven't.

**Tap any board row** — global or friends — to open that hero's profile: a big card plus a **head-to-head** table pitting their level, weekly XP, best streak and ascension against yours, with the leader of each metric highlighted. From a friend's card you can remove them in one tap; tapping your own row previews the exact card others see.

## Comfort & safety

- **Quest of Atonement (streak repair)** — when a 3+ day streak breaks, you get until midnight to mend it: clear all of today's dailies and the flame is relit as if it never went out. Softens the single most rage-quit-inducing moment in any streak app; the Streak Shield still prevents the break entirely. Mending unlocks the *Keeper of the Flame* title, and your **best streak** is tracked forever in Stats.
- **Journal archive** — every entry you've ever written, grouped by month with live search.
- **Undo everywhere** — deleting a quest/habit/reward or logging a slip shows a 6-second ↩ Undo toast instead of a scary confirm dialog.
- **Haptics** — subtle vibration feedback on mobile for earns, hits, level-ups and chests (tied to the sound toggle).
- **Reminders** — optional notifications (⚙️ → Reminders): an evening nudge if dailies/journal are unfinished, a boss-escapes-tomorrow warning, and break/work alerts from the focus timer when the tab is hidden. Uses the browser Notification API, so they fire while the app is open; true background push arrives with a later backend phase.
- **Daylight theme** — a warm light theme alongside the five dark ones, plus visible keyboard-focus rings.

## Look & feel

Dark, game-flavoured, and deliberately not generic. A hand-written **WebGL shader gradient** (`gradient.js`) drifts slowly behind the app — a self-contained, dependency-free take on the "mesh gradient" look, tinted live by your chosen theme. It's a progressive enhancement: if WebGL is missing it hides itself and a CSS aurora fallback takes over, it renders a single static frame under `prefers-reduced-motion`, pauses when the tab is hidden, and runs at ~30fps with a capped pixel-ratio to stay light on phones. Surfaces use translucent "machined" panels with soft inset highlights and coloured hover glows; blur is reserved for fixed overlays (never large scrolling content) to keep mobile smooth.

## Files

`index.html` (markup) · `styles.css` (styles) · `app.js` (UI logic) · `core.js` (game engine, no DOM) · `gradient.js` (WebGL background) · `cloud.js` (Supabase sync client) · `supabase/schema.sql` + `supabase/leaderboard.sql` + `supabase/friends.sql` (database schema & migrations) · `sw.js` + `manifest.json` + icons (PWA) · `test.js` + `test-cloud.js` + `test-ui.js` (604 tests).

## Development

```
npm install   # dev dependency: jsdom (for the UI tests)
npm test      # runs test.js (engine) + test-ui.js (full UI flow in jsdom)
npm start     # serves it locally
```

No build step — plain static files. All payouts, prices, curves, prestige boons, skill tiers and onboarding paths are constants at the top of `core.js`.

## Roadmap

Cloud accounts + sync, opt-in leaderboard and friends-by-code shipped (Supabase). Next candidates: true background push notifications (Supabase Edge Functions + Web Push), a premium tier (extra themes/frames, advanced insights), and deeper social features (shared boss fights, accountability parties) — all enabled by the same backend.
