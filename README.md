# ScaleMyLife

Turn your real life into an RPG. Do the work — tasks, habits, focused study — and earn XP, coins, ranks and loot. Spend coins on real rewards you actually want, guilt-free, because you earned them.

ScaleMyLife is a fast, offline-capable web app (a PWA). It installs to a phone home screen, works without a connection after first load, and needs no setup to try. **Cloud sync is built in**: create a free account (Supabase-backed) and your save follows you across devices; without an account each device keeps its own save (export/import a JSON backup any time).

## How to run

- **Try it instantly:** open `index.html` in a browser and create your hero.
- **Host it:** it's plain static files — deploy the folder to Netlify, Vercel or GitHub Pages and share a public URL.
- **Install on a phone:** once hosted, Android Chrome shows an "Install" prompt; on iPhone use Safari → Share → "Add to Home Screen". It runs fullscreen and works offline.

Saves live in the browser (localStorage) and — once you sign in — in your cloud account too. Old LiFE RPG saves migrate automatically.

## Cloud sync (Supabase)

One `saves` row per user, protected by Postgres Row Level Security, talked to by a hand-rolled zero-dependency REST client (`cloud.js` — no SDK, no build step). Email/password accounts; the app pushes your save a few seconds after every change and pulls the newer side on boot. Signing in on a second device asks which save wins - and "which save wins" is decided by which one is genuinely **more advanced** (a monotonic progress key: seasons, then level, then XP, then lifetime activity), not merely which was touched last, so a stale device can never silently overwrite your real progress. "Sync now" is a true two-way sync (it pulls and adopts a more-advanced cloud save before pushing), and a pending save is flushed the moment you background or close the tab. Sessions and the API key live outside the save file, so exports never leak credentials.

Setting it up for your own deployment:
1. In the Supabase dashboard run `supabase/schema.sql` (SQL Editor → paste → Run).
2. Authentication → Sign In / Up → disable "Confirm email" (or set your Site URL so confirmation links land on your domain).
3. Paste the **publishable (anon) key** into `PUBLISHABLE_KEY` in `cloud.js` — or just paste it once in ⚙️ Settings, which stores it in the browser. The key is public by design; RLS is the security boundary.

## Start here

First launch runs a short, skippable primer, then **Create your hero**: name, avatar (eight **hand-drawn vector heroes** — Knight, Mage, Rogue, Ranger, Paladin, Witch, Monk, Bard — plus a big emoji grid), a **theme picked with a live preview** of the page behind, and your **identities**: pick *all* the paths that fit (Student, Athlete, Founder, Creative — a student can also be an athlete and a founder). The starter board blends every pick: life areas shared by your identities come first, each identity adds its signature areas (up to 7), and quests/habits/rewards merge without duplicates so you never stare at an empty board — or an overflowing one. A new hero is then walked through an **interactive spotlight tour** that dims the screen and points at the real controls one by one (re-runnable any time from ⚙️ → Interactive tour). Everything you add is editable — every quest, main quest and habit has a ✎ button. The app opens on the **Today** tab.

## The core loop

Work earns coins, coins buy pleasures. A solid day (dailies + habits + 2 focus blocks + journal/sleep) earns ~90–110 💰. Gaming 1h costs 60.

- **Main quests** — big goals, broken into steps inside the card; the bar fills as you clear them. 300xp / 150💰 on completion.
- **Daily quests** — recurring, reset at midnight. Clear them all → **daily chest**. You can also **schedule** a daily to specific weekdays (e.g. gym Mon/Wed/Fri); off-day dailies sit dormant and don't block the chest.
- **Side quests** — one-offs. Give them due dates to line up in **Deadlines**, export them as an **.ics calendar** file, or promote one (⬆) into a main quest.
- **Focus (pomodoro)** — 25/5, 50/10, 90/15, free run or a custom split, looping until you stop. You're paid for every worked minute (1.2xp + 0.6💰/min). When a work phase ends a **warm alarm rings and the break waits** — you start it when you're ready (or skip straight back to work). **Pause/Resume** freezes the timer without collecting, and the **browser tab title shows the live countdown** ("🎯 24:13 · Focus", "🔔 Break time!"). Breaks show a campfire and heal +3 ❤️. Optional study music plays in a **docked mini-player that keeps going as you move between tabs** (Lofi/synthwave/any YouTube URL; pop-out fallback). Attach a session to a **main quest** and the worked time is banked on that goal's card.
- **Market with anti-binge pricing** — a proper storefront: rewards render as cards with an icon matched to what they are (🎮 📺 ☕ 🛁…), locked items grey out with an **affordability meter** showing how close your purse is, and surged prices show the original struck through. Buy rewards you actually want. To stop a coin hoard from funding unlimited indulgence, repeat purchases of the same reward *the same day* cost progressively more (a soft cap you can toggle off), and Black-Market rule-breaking is hard-capped at 2×/day. Rest/Hotel items never surge. Every reward's per-day cap is editable.
- **Habits** — good habits pay xp/coins, refresh daily, and show a 7-day chain; set a weekly frequency (gym 3×/week) for week progress + a streak of weeks met.
- **Deadlines, Defeat, Streak Shield, Weekly boss** — hit 0 ❤️ and you're Defeated (see **Defeat & the Last Stand** below); a Streak Shield auto-saves one missed day; name THE task of the week and slay it within 7 days for 500xp / 250💰.

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

It's privacy-first: adding someone lets *you* see their public profile card (name, avatar, level, rank, weekly XP, best streak — never their save), and Postgres Row Level Security gates every read so a profile is only visible to itself, to the people who've added it, to people it has added, or to anyone who's on the global board. Codes are looked up through a `SECURITY DEFINER` function (callable only by signed-in users) so you can add a friend before either of you follows the other.

**Invites make it mutual with one code.** When someone adds your code, an **📨 Invites** row appears in your friends box (and a banner on your Friends board): *Add back* follows them in one tap — no code exchange in the other direction — and ✕ declines by removing their follow of you. Run `supabase/friends.sql` then `supabase/invites.sql` once to enable it; the app degrades gracefully if you haven't.

**Tap any board row** — global or friends — to open that hero's profile: a big card plus a **head-to-head** table pitting their level, weekly XP, best streak and ascension against yours, with the leader of each metric highlighted. From a friend's card you can remove them in one tap; tapping your own row previews the exact card others see.

## Sage, your guide 🦉

A little animated owl lives in the corner of the screen. Tap him and he speaks a **daily briefing** built straight from your save: streak repairs to make, bosses about to escape, quests due, dailies and habits left, a journal nudge in the evening - at most five lines, most urgent first, and each one jumps to the right tab. He greets you once a day on your first visit, and his ring and aura shift with the state of your day (on fire with your streak, worried when HP is low, alarmed when a streak needs mending). Runs fully offline - the briefing is generated by the game engine (`RPG.briefing`), no AI or network involved. Toggle him off in ⚙️ Settings. A future phase can plug a real conversational assistant into this same panel (via a Supabase Edge Function so API keys stay server-side).

## Defeat & the Last Stand

Feeding a monster enough to drop your HP to zero no longer just slaps your wrist — you're **Defeated** and left **Downed**. The design is deliberately humane, because the moment death punishes honesty too hard, people stop logging their slips and the whole system breaks:

- **You never lose real progress** — no levels, no XP, no streak. Death is a state, not a rollback.
- **The sting:** you drop a share of your coins (25% by default, capped) — a real but survivable loss.
- **The weight:** while Downed you earn **half XP and zero coins**, your avatar greys out, and Sage sounds the alarm. That pressure is what makes you want to recover fast.
- **The way back:** rest to **full HP** — sleep well or heal at the 🛏️ Hotel — to **Rise**, healing fully, banking a comeback XP bonus and unlocking the *Phoenix* title. Rising from the floor is turned into its own small victory.
- **No death spirals:** once Downed, further slips that day can't re-kill you.
- **Hardcore mode** (opt-in, ⚙️ Settings) for players who want stakes: defeat costs *half* your coins and revives you at just 10 HP.

Stats tracks your **defeats** and **comebacks**; the whole thing mirrors the Quest of Atonement philosophy — meaningful consequences, always with a lit path home. The rules are explained *before* they ever bite: tap the **HP bar** or the **"What if I lose?"** link on the monsters panel for a plain-language breakdown, and the onboarding tutorial mentions it too.

## Comfort & safety

- **Quest of Atonement (streak repair)** — when a 3+ day streak breaks, you get until midnight to mend it: clear all of today's dailies and the flame is relit as if it never went out. Softens the single most rage-quit-inducing moment in any streak app; the Streak Shield still prevents the break entirely. Mending unlocks the *Keeper of the Flame* title, and your **best streak** is tracked forever in Stats.
- **Journal archive** — every entry you've ever written, grouped by month with live search.
- **Undo everywhere** — deleting a quest/habit/reward or logging a slip shows a 6-second ↩ Undo toast instead of a scary confirm dialog.
- **Haptics** — subtle vibration feedback on mobile for earns, hits, level-ups and chests (tied to the sound toggle).
- **Reminders** — optional notifications (⚙️ → Reminders): a nudge if dailies/journal are unfinished, a boss-escapes-tomorrow warning, and break/work alerts from the focus timer when the tab is hidden. Pick the nudge time yourself (4pm–10pm) so night owls and early birds each get reminded when it actually helps. Uses the browser Notification API, so they fire while the app is open; true background push arrives with a later backend phase.
- **Daylight theme** — a warm light theme alongside the five dark ones, plus visible keyboard-focus rings.

## Look & feel

Dark, game-flavoured, and deliberately not generic. A hand-written **WebGL shader gradient** (`gradient.js`) drifts slowly behind the app — a self-contained, dependency-free take on the "mesh gradient" look, tinted live by your chosen theme. It's a progressive enhancement: if WebGL is missing it hides itself and a CSS aurora fallback takes over, it renders a single static frame under `prefers-reduced-motion`, pauses when the tab is hidden, and runs at ~30fps with a capped pixel-ratio to stay light on phones. Surfaces use translucent "machined" panels with soft inset highlights and coloured hover glows; blur is reserved for fixed overlays (never large scrolling content) to keep mobile smooth.

**Feel & finish.** A single motion layer gives every tap a springy, physical press and every card quiet, theme-tinted depth with a soft lift on pointer devices. Switching tabs plays a staggered entrance cascade, while in-tab updates (clearing a quest, checking a habit) stay perfectly calm — no re-animating the whole list on every action. Clearing a quest or habit fires a quick check-and-particle **burst anchored to where you tapped**; the leaderboard shows **shimmer skeleton rows** while it loads instead of a spinner or placeholder text; and the Stats tiles use confident **tabular monospace numerals** with quiet uppercase labels for an editorial read. All motion is `transform`/`opacity` only and fully disabled under `prefers-reduced-motion`.

## Files

`index.html` (markup) · `styles.css` (styles) · `app.js` (UI logic) · `core.js` (game engine, no DOM) · `gradient.js` (WebGL background) · `cloud.js` (Supabase sync client) · `supabase/schema.sql` + `supabase/leaderboard.sql` + `supabase/friends.sql` + `supabase/invites.sql` (database schema & migrations) · `sw.js` + `manifest.json` + icons (PWA) · `test.js` + `test-cloud.js` + `test-ui.js` (785 tests).

## Security

The app is a static PWA with no server of its own; Supabase Postgres **Row Level Security is the security boundary** (the publishable key in `cloud.js` is public by design — it can only do what RLS policies allow). A `Content-Security-Policy` meta tag pins scripts, connections, frames and fonts to the exact origins the app uses, so injected external scripts can't load or phone home. Every piece of remote or user-entered text is HTML-escaped before rendering. Sign-in has a full **forgot-password flow** (reset email → new password on return). Only a six-field profile card is ever shared; the save itself is readable by its owner alone.

## Development

```
npm install   # dev dependency: jsdom (for the UI tests)
npm test      # runs test.js (engine) + test-ui.js (full UI flow in jsdom)
npm start     # serves it locally
```

No build step — plain static files. All payouts, prices, curves, prestige boons, skill tiers and onboarding paths are constants at the top of `core.js`.

## Roadmap

Cloud accounts + sync, opt-in leaderboard and friends-by-code shipped (Supabase). Next candidates: true background push notifications (Supabase Edge Functions + Web Push), a premium tier (extra themes/frames, advanced insights), and deeper social features (shared boss fights, accountability parties) — all enabled by the same backend.
