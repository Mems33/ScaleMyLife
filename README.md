# ScaleMyLife

Turn your real life into an RPG. Do the work — tasks, habits, focused study — and earn XP, coins, ranks and loot. Spend coins on real rewards you actually want, guilt-free, because you earned them.

ScaleMyLife is a fast, offline-capable web app (a PWA). It installs to a phone home screen, works without a connection after first load, and needs no setup to try. **Cloud sync is built in**: create a free account (Supabase-backed) and your save follows you across devices; without an account each device keeps its own save (export/import a JSON backup any time).

## How to run

- **Try it instantly:** open `index.html` in a browser and create your hero.
- **Host it:** it's plain static files — deploy the folder to Netlify, Vercel or GitHub Pages and share a public URL.
- **Install on a phone:** once hosted, Android Chrome shows an "Install" prompt; on iPhone use Safari → Share → "Add to Home Screen". It runs fullscreen and works offline. After the hero's first XP, Today shows an install card in the cloud nudge's slot: an Install button on Android, the Share steps on iPhone (where Safari can erase a site's save after a week away, and a Home Screen app is exempt). Got it hides it for good.

Saves live in the browser (localStorage) and — once you sign in — in your cloud account too. Old LiFE RPG saves migrate automatically.

## Cloud sync (Supabase)

One `saves` row per user, protected by Postgres Row Level Security, talked to by a hand-rolled zero-dependency REST client (`cloud.js` — no SDK, no build step). Email/password accounts; the app pushes your save a few seconds after every change and pulls the newer side on boot. Signing in on a second device asks which save wins - and "which save wins" is decided by which one is genuinely **more advanced** (a monotonic progress key: seasons, then level, then XP, then lifetime activity), not merely which was touched last, so a stale device can never silently overwrite your real progress. "Sync now" is a true two-way sync (it pulls and adopts a more-advanced cloud save before pushing), and a pending save is flushed the moment you background or close the tab. Sessions and the API key live outside the save file, so exports never leak credentials.

Setting it up for your own deployment:
1. In the Supabase dashboard run `supabase/schema.sql` (SQL Editor → paste → Run).
2. Authentication → Sign In / Up → disable "Confirm email" (or set your Site URL so confirmation links land on your domain).
3. Paste the **publishable (anon) key** into `PUBLISHABLE_KEY` in `cloud.js` — or just paste it once in ⚙️ Settings, which stores it in the browser. The key is public by design; RLS is the security boundary.

## Start here

First launch opens a four-step wizard: **your hero** (name, one of the six heroes open at level 1, a theme with a live preview), **your day** (time per day, biggest struggle, and how much game you want: Calm, Classic or Hardcore, each explained for someone who has never seen the app), **your plate** (tap a quest pack or say, paste or type what is really going on, one task per line, and Sage turns it into quests) and **your board** (what Sage built, grouped by pack, your own tasks and a starter set, as toggles, with Start). The starter set is the Balanced board; a starter habit or daily in a life area your own list already covers starts switched off, with a note saying why. Everything you add is editable. The app opens on the **Today** tab, on Sage's draft for the day.

There is no tour at the end. A new hero starts with a small game (quests, habits, XP, the streak, the daily chest, focus, Sage) and the rest arrives as events, each with its own screen the day it opens: the Market at level 2 or with the first chest, HP and monsters at level 3, the weekly boss at level 4, the leaderboard and friends at level 5. Ten of the sixteen hand-drawn heroes open the same way, between level 2 and level 20. Saves made before this change keep everything open. The tour and the "How it works" slides are still in Settings.

## Sage, your game master

In a tabletop RPG the players do not write their own quests. The game master does. That is Sage's job here, and all of it works offline, with no account and no AI call.

- **Capture.** The Add button opens one sheet. Talk (where the browser has speech recognition), paste or type several things at once: "call the bank and email my landlord, then finish the marketing essay by friday, gym 3x a week". Each task comes back as a card with its type (side quest, daily, habit, main quest, monster), difficulty, life area and date already guessed. Tap a chip to change the guess, switch a card off, add the rest in one tap. A main quest never arrives empty: an exam, an essay or an application gets a dated step list planned backward from the deadline, and anything else starts with a five-minute kickoff step.
- **Quest packs.** Ready-made campaigns for common situations: exam coming, internship hunt, essay or report, get in shape, side project, fix my sleep, life admin.
- **Daily Draft.** Each morning Today opens on three to five picks, each with its reason ("Overdue by 2 days", "Next step on Pass the Corporate Finance exam"). Keep or drop each one and lock the plan. Finishing the whole plan wins the day: a small bonus and the streak screen. Whatever is left rolls into tomorrow's draft by itself. Today shows one list at a time: the draft until it is locked, then the plan, with anything else due today folded under "Also today". Habits today keeps the daily habits and the weekly ones that can no longer wait in view, and folds the rest under "Later this week".
- **Evening Debrief.** Sage writes the journal line from what was actually done. A mood tap and Save close the day.
- **The weekly boss and the chronicle.** Sage proposes the boss from the week's biggest deadline, and Progress carries a short titled recap of the last seven days.
- **Game intensity.** Calm (no HP, no monsters), Classic, or Hardcore, set in the wizard and changeable in Settings.

The rules behind all of this live in `core.js` (`parseDump`, `PACKS`, `dailyDraft`, `debrief`, `suggestBoss`, `chronicle`, `STAGES`) and are covered by engine tests. The design notes are in `docs/superpowers/specs/2026-11-16-sage-game-master-design.md`.

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

Dark, game-flavoured, and deliberately not generic. Everything is drawn in **pixel tiles**: every icon, the sixteen hero portraits, the design-your-own hero, Sage the owl and the weekly boss live in `art.js` as small text grids, so there are no image files and no emoji left on screen (emoji the app writes are swapped for their drawing as the page renders, and stay readable for screen readers). Behind the app a hand-written **WebGL mosaic** (`gradient.js`) drifts as soft pools of light quantised into tiles, tinted by the theme. It hides itself if WebGL is missing (a CSS fallback takes over), draws one still frame under `prefers-reduced-motion`, pauses when the tab is hidden, and runs at about 25fps at reduced resolution to stay light on phones. Opening the app plays a short intro: the title assembles from flying tiles over the mosaic. The default Dungeon theme is near-black with an Ember accent.

**Feel & finish.** A single motion layer gives every tap a springy, physical press and every card quiet, theme-tinted depth with a soft lift on pointer devices. Switching tabs plays a staggered entrance cascade, while in-tab updates (clearing a quest, checking a habit) stay perfectly calm — no re-animating the whole list on every action. Clearing a quest or habit fires a quick check-and-particle **burst anchored to where you tapped**; the leaderboard shows **shimmer skeleton rows** while it loads instead of a spinner or placeholder text; and the Stats tiles use confident **tabular monospace numerals** with quiet uppercase labels for an editorial read. All motion is `transform`/`opacity` only and fully disabled under `prefers-reduced-motion`.

## Files

`index.html` (markup) · `styles.css` (styles) · `app.js` (UI logic) · `core.js` (game engine, no DOM) · `fx.js` (motion layer: flying XP chips, combo pill, counters; no game logic, the app runs without it) · `art.js` (every drawing in pixel tiles: icons, heroes, the title, and the emoji swap; no game logic) · `gradient.js` (WebGL background) · `cloud.js` (Supabase sync client) · `supabase/schema.sql` + `supabase/leaderboard.sql` + `supabase/friends.sql` + `supabase/invites.sql` + `supabase/perf.sql` (database schema & migrations) · `sw.js` + `manifest.json` + icons (PWA) · `privacy.html` + `terms.html` + `robots.txt` + `sitemap.xml` (launch pages & SEO) · `test.js` + `test-cloud.js` + `test-ui.js` (1,415 tests).

## Security

The app is a static PWA with no server of its own; Supabase Postgres **Row Level Security is the security boundary** (the publishable key in `cloud.js` is public by design, and it can only do what RLS policies allow). A `Content-Security-Policy` meta tag pins scripts, connections, frames and fonts to the exact origins the app uses, so injected external scripts can't load or phone home. Every piece of remote or user-entered text is HTML-escaped before rendering. Every account step is one in-app sheet (sign in, create account, forgot password, the new password after a reset email, and "two saves found" when the device and the account disagree), so no browser prompt() or confirm() box is left on that path. Email links are never trusted on sight: anyone can mint a link for their own account, and opening one blindly would sync the player's save into it. The link's session is set aside until it is accepted, automatically when this device asked for that link with the same email, otherwise on an "Is this your account?" sheet that names the email. A new device can sign in from the intro or step 1 of the wizard ("I already have an account") and loads the account's hero directly. Signed out, the owl says chat needs a free account and opens the sign-up sheet. `supabase/sage.sql` also takes the chat counter function away from the anon and authenticated roles, so only the Edge Function can spend a player's daily chats. Only a six-field profile card is ever shared; the save itself is readable by its owner alone.

## Production readiness

- **Database scale** — `supabase/perf.sql` clears every Supabase performance-advisor finding: covering indexes for the friends foreign key and the global-board query, `(select auth.uid())` in all RLS policies so auth is evaluated once per query instead of once per row, and a single merged DELETE policy on friends. Tables hold one row per user (plus one per friendship edge), so growth is linear and PK-indexed.
- **Monitoring** — a global error hook stores the last 20 runtime errors in a local ring buffer; ⚙️ Settings grows a **🩺 Diagnostics** button whenever something was captured (view / copy / clear), so bug reports come with real evidence. Server-side, the Supabase dashboard provides API/DB logs and usage alerts.
- **Recovery** — the save exists in three places (browser localStorage, cloud row, manual JSON export), sync conflicts resolve by game progress with a pre-sync backup you can restore from Settings, and deploys are plain static files on git — rollback is `git revert`.
- **Updates reach phones** — installed PWAs rarely hard-reload, so the app re-checks for a new service worker every time it returns to the foreground and refreshes itself once when a new version takes over. Desktop and mobile now update on the same day you deploy.
- **Launch pages:** meta description, Open Graph / Twitter link previews, `robots.txt`, `sitemap.xml`, and honest [privacy](privacy.html) / [terms](terms.html) pages (no ads, no tracking cookies, the anonymous visit counts and Sage chat spelled out, export & delete rights) linked from ⚙️ Settings.

## Development

```
npm install   # dev dependency: jsdom (for the UI tests)
npm test      # runs test.js (engine) + test-ui.js (full UI flow in jsdom)
npm start     # serves it locally
```

No build step — plain static files. All payouts, prices, curves, prestige boons, skill tiers and onboarding paths are constants at the top of `core.js`.

## Roadmap

Cloud accounts + sync, opt-in leaderboard and friends-by-code shipped (Supabase). Next candidates: true background push notifications (Supabase Edge Functions + Web Push), a premium tier (extra themes/frames, advanced insights), and deeper social features (shared boss fights, accountability parties) — all enabled by the same backend.
