# Sage as game master: design spec

Status: implementation on branch `feat/sage-game-master`, uncommitted until Mehmet asks. One pull request, Mehmet merges.

Source of the decisions: the Miro board "ScaleMyLife redesign draft" (https://miro.com/app/board/uXjVEUNntQo=/), frames 5 and 6, read on 16 Nov 2026.

## Why

The game systems are mature. What still costs the user effort is admin:

- Every real task is typed by hand, after choosing one of six task types and filling two dropdowns and a date.
- The starter board is generic ("Read 20 pages"). The user's real exams, applications and deadlines never enter the app by themselves.
- The morning list is only what the user built. Nothing proposes a plan.
- About fifteen game systems are live on day one, which is the Habitica problem.
- Fourteen screens (six wizard steps, a ready screen, a seven-step tour) sit between a new user and the first cleared quest.

## The idea

In a tabletop RPG the players never write their own quests. The game master does. Sage becomes the game master: the user says what is going on, Sage writes, sizes and paces the quests, and the user accepts, plays or vetoes.

## Decisions from the board

Keep: Sage as game master, voice brain dump, paste a syllabus, Daily Draft, Evening Debrief, game systems in stages, Sage proposes the weekly boss, weekly chronicle, first step under five minutes, quest packs, game intensity (Calm, Classic, Hardcore).

Maybe, built in a form that keeps control with the user: one capture button (the app picks the task type, the user can change it with one tap), avatar skins that open up at higher levels.

Maybe, not in this change: parties of 2 to 4 with a shared boss.

Killed: a focus session closing its quest (focus time keeps being banked on the quest, as today), the Android share sheet.

Answers: accounts stay required for the AI chat. Push notifications are wanted on PC and phone but need a backend phase of their own. First testers are EDHEC classmates. Day one shows XP, the streak and the chest only. Voice uses the free route (the browser's speech recognition).

## Constraints (unchanged from the September revamp)

- Plain static files, no build step. ES5 style in `core.js`, `app.js`, `cloud.js`.
- `core.js` is the only place state mutates. New economy numbers are constants at the top of `core.js`.
- CSP stays as is. Voice input uses the browser's built-in speech recognition, which needs no new origin.
- Offline first. Everything in this change works with no network and no account. Nothing calls the Sage Edge Function.
- Every precached file that changes bumps `CACHE` in `sw.js`. A new file (`fx.js`) joins the precache list.
- Copy rules: no em dashes, none of the banned words, user text always through `esc()`.
- `npm test` stays green. Tests that assert a replaced structure are migrated in the same change.
- Motion is transform and opacity only, and off under `prefers-reduced-motion` (already global).

## What ships

### 1. Capture: one button, no task types

The Add button on Today opens a capture sheet: one text area, a microphone button where the browser supports speech recognition, and a row of quest packs. The user talks, pastes or types several things at once. `RPG.parseDump(text, now, skills)` splits the text into items and gives each one a type (side quest, daily, habit, main quest, monster), a difficulty, a life area and a due date, reusing `RPG.parseTask` for dates and repeats. The sheet shows the items as cards. Each chip on a card cycles on tap (type, difficulty, area), each card can be switched off, and one button adds everything through the existing engine actions.

A main quest never arrives empty. It gets steps from a template when the text matches one (exam, essay or report, application), and otherwise a single five-minute kickoff step.

### 2. Quest packs

`RPG.PACKS` holds ready-made campaigns: exam, internship hunt, essay or report, get in shape, side project, fix my sleep, life admin. `RPG.buildPack(id, opts, now)` returns the same item shape as `parseDump`, so packs flow through the same cards. The exam pack plans backward from the exam date.

### 3. Daily Draft and the plan

Each morning Today opens with Sage's draft: three to five items picked by `RPG.dailyDraft(state, now)` from overdue and due quests, the next step of each main quest, today's dailies, habits behind their weekly pace, and anything left from yesterday's plan. Each row can be kept or dropped, and one button locks the plan (`actions.setPlan`). The Now panel then shows the plan with a progress ring. Finishing the whole plan pays a small day bonus once (`actions.claimDayWon`, constants `PLAN_XP`, `PLAN_COINS`) and opens the streak celebration.

### 4. Evening Debrief

`RPG.debrief(state, now)` writes a one-line summary of the day from the log. The daily log form offers it as a chip that fills the note, and offers the last logged sleep duration as a quick button. Mood, Sage's line, Save: three taps. Unfinished plan items roll into the next draft by themselves.

### 5. Game systems in stages, and game intensity

A hero made through the wizard starts with quests, good habits, XP, the streak, the chest, focus and Sage. The rest arrives as events (`RPG.STAGES`, `RPG.checkUnlocks`):

- Level 2 or the first chest: the Market (coins and rewards).
- Level 3: HP and monsters, with the Hotel and Guilty pleasures.
- Level 4: the weekly boss.
- Level 5: leaderboard and friends.

Each opening is announced inside the level-up celebration, or by its own overlay when it arrives without a level. Existing saves keep everything (staging is off for them). Settings gets a Game intensity control: Calm hides HP and monsters for good, Classic is the staged game, Hardcore is Classic plus the existing hardcore rules.

Hero skins follow the same idea for staged heroes: six are free at level 1, the other ten open between level 2 and level 20.

### 6. Sage proposes the boss, and writes the week

`RPG.suggestBoss(state, now)` picks the biggest deadline of the week. The empty boss strip shows it with a one-tap accept. `RPG.chronicle(state, now)` turns the week's numbers into a short titled recap on Progress.

### 7. Celebration and motion layer

`fx.js` is a new, self-contained file: number tickers, fly-to-target particles, the combo pill, pulses. It holds no game logic, and `app.js` calls it behind `window.FX` checks, so the app runs without it. The level-up, rank-up, now-open and day-won screens share one ceremony layout (rays, medallion, staggered reward rows).

### 8. A shorter first minute

The wizard becomes five steps: hero, path, day, plate (packs and a brain dump), plan (the board Sage built, as toggles) with Start on the last step. The rewards step goes (the Market arrives later with its own moment), the ready screen goes, and the automatic tour goes because each system now introduces itself when it opens. The tour stays in Settings.

## What does not ship here

- Background push notifications: needs VAPID keys, an Edge Function and a schedule. Its own change.
- An account audit: the sign-up, sign-in and reset flows are untouched and need a pass on the live site.
- Parties, pasted screenshots (needs paid vision), AI-refined capture.
- Any Edge Function deploy.

## Testing

Engine: new sections in `test.js` for `parseDump`, packs, the draft and plan, the debrief line, the boss suggestion, the chronicle and stages. UI: new sections in `test-ui.js` for the capture sheet, the draft, the staged game and the new wizard. The long UI flow keeps its hero and calls `RPG.unlockAll` right after creating it, so every existing assertion still runs against the full game.
