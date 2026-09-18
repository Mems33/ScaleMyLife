# ScaleMyLife revamp: design spec

Status: implementation on branch `feat/revamp-ux`, one commit per phase, one pull request. Mehmet merges.

Companion documents: the UI inventory (function names, line numbers, the selector contract) at
`/private/tmp/claude-501/-Users-mems-Documents-ScaleMyLife/4203cdbe-8ecb-4147-b7b4-afdf4864c958/scratchpad/ui-inventory.md`
and the phase plan at `docs/superpowers/plans/2026-09-18-revamp.md`.

## Why

The game systems are mature (streak repair, shields, defeat and comeback, monsters, weekly boss, chest, ranks, seven onboarding paths). What holds the app back is presentation and guidance:

- On a phone (375 px) the hero card plus six life-area cards fill the whole first screen. A user never sees a task without scrolling. On desktop the same chrome takes the top 40% of every tab.
- The pixel font (Press Start 2P) is used for section titles at 9 to 13 px, where it is hard to read. The level number in life-area cards renders as a broken glyph at that size.
- A quest row can show five chips at once (difficulty, area, schedule, due, focus time). Six saturated accents compete on one screen.
- A new user meets four explainers back to back: a five-slide tutorial, a one-screen hero form, a ten-step spotlight tour, then Sage's daily popup. Nothing in that sequence sets up their day beyond the path presets.
- Creation is raw forms (text, select, date). Rewards are typed by hand. The Black Market's logic (coins plus HP, steep surge, two a day) is real and good but invisible. The premium surfaces (Royal Chamber, Royal tab) sell nothing.
- Stats are complete but flat: tiles and div bars with nothing that frames next week.

## Principles

1. Content first. The next thing to do is the first thing on screen. Chrome is compact and identical everywhere.
2. One primary action per surface. Everything else is visually quieter.
3. Progress is always visible, never loud. A slim XP bar and the streak live in the header. Big celebration only at real moments (a completion, a level, the chest).
4. Guided, not typed. Creation uses chips, presets and suggestions first. Typing is optional and last.
5. Legible first, pixel second. Pixel type is reserved for the wordmark, big level numbers and celebration overlays, never under 14 px.
6. Color means something. One brand accent (the theme accent, gold by default) for progress and primary actions, green for done and earned, red for danger and HP. Everything else is muted.
7. Motion with intent. 120 to 300 ms, a gentle spring on presses, one satisfying completion animation. `prefers-reduced-motion` turns it all off (already wired, keep it).
8. The economy loop is legible. Earn (quests, habits, focus) becomes coins, coins become rewards the user actually wants, and the shop shows what they are working towards.
9. Phone is the primary canvas. Desktop is the same app with more room.
10. Keep the personality. Sage, ranks, monsters, the chest, the weekly boss, the six themes, the 16 heroes and the hero builder all stay. Evolve, do not replace.

## Constraints

- Plain static files, no build step, no bundler, no framework. Anything vendored lives in the repo.
- CSP (index.html:9): scripts only from `'self'`, styles and fonts only from Google Fonts. Icons are an inline SVG sprite in `index.html`, never a CDN.
- Offline first: `sw.js` precaches `index.html`, `styles.css`, `core.js`, `app.js`, `gradient.js`, `cloud.js`, `manifest.json`, `privacy.html`, `terms.html`. Any commit touching one of those bumps `CACHE` in `sw.js` (`sml-vNN`), or the release hygiene test in `test.js` fails.
- `core.js` is the engine and the only place state mutates. UI goes through `RPG.actions`. New pure helpers (the quick-add parser) and new constants (reward catalog, onboarding suggestions) go in `core.js` next to the existing ones and get engine tests in `test.js`.
- ES5 style in `app.js`, `core.js`, `cloud.js`: `var`, function expressions, string concatenation, inline `onclick` wiring. Every inline handler string that receives user text is escaped with `esc()`.
- Themes: all six keep working. `applyTheme()` (app.js:77) writes `--bg`, `--panel`, `--panel2`, `--line`, `--gold`, `--ink`, `--muted` as inline custom properties and toggles `body.light`. New tokens derive from those seven and the `--gold` name stays as the brand alias.
- Copy and code comments: no em dashes anywhere, and none of: delve, tapestry, landscape, realm, navigate the complexities, it's worth noting, at its core, in today's fast-paced world, a testament to, game-changer, unlock, leverage (verb), seamless, robust, crucial. Sage's own prompt already bans em dashes; the app copy matches.
- Accessibility already in place stays (inventory section 11). Add 44 px touch targets on every primary control, 4.5:1 text contrast on every theme, and keep `:focus-visible` rings.
- `npm test` (920 tests) passes at every commit. Tests that assert old structure are migrated in the same commit with an equivalent assertion, never deleted without a replacement (the premium tests are the one deliberate removal).
- Function names the rest of the app and the tests rely on keep their names and signatures: `render`, `go`, `renderHUD`, `renderSkills`, `renderTabs`, every `render*` view, `openSettings`, `openCharacter`, `tut`, `tutSkip`, `onboarding`, `createHero`, `startTour`, `saveDailyLog`, `addQuest`, `addDaily`, `addStep`, `addGoal`, `addHabit`, `doQuest`, `doHabit`, `buy`, `toggleMascot`, `openSageChat`, `sageSend`.

## Design system

### Type

- Wordmark, big level numbers, celebration overlays: `Press Start 2P`, at 14 px or larger only.
- Section titles and screen headings: `Outfit` 600/700, added to the existing Google Fonts link. Geometric and confident, a premium game menu without the cartoon feel.
- Body: `Karla` 400/600/700 at 15 to 16 px (existing).
- Numbers: `IBM Plex Mono` 500/700 with tabular figures (existing).

Scale: 12 meta, 13 label, 15 body, 17 row title, 20 section, 26 screen title, 34 hero number.

Rule of application: every `h2`, `.panel h2`, `.mhead b` and section title that currently uses `var(--px)` at under 14 px switches to Outfit. `.logo` keeps the pixel font. Tab labels use Outfit 12/600 uppercase with letter spacing instead of pixel 9 px.

### Color tokens

Declared in `:root` next to the existing ones and derived from the theme variables so `applyTheme()` needs no change beyond the light-theme aliases:

- Surfaces: `--surface-0: var(--bg)`, `--surface-1: var(--panel)`, `--surface-2: var(--panel2)`, `--border: var(--line)`, `--border-strong: color-mix(in srgb, var(--line) 60%, var(--ink))`.
- Text: `--text-1: var(--ink)`, `--text-2: var(--muted)`, `--text-3: color-mix(in srgb, var(--muted) 70%, transparent)`.
- Brand: `--brand: var(--gold)`, `--brand-soft: color-mix(in srgb, var(--gold) 14%, transparent)`, `--brand-ink: #1a1200` (dark) and `#fff` under `body.light`.
- Semantic: `--ok: #3ddc84`, `--danger: #ff5470`, `--info: #5aa2ff`, `--warn: #ff9d47`, each with a `-soft` at 14%.
- `--skill` purple stays and is used only on Progress and the Hero sheet.

Usage discipline: red means damage or late, nothing else. Gold means brand, currency and primary action. Green means done and earned. Purple means a life area. Hardcore mode and the Guilty pleasures section use `--warn` soft tints, not red.

### Spacing, radius, elevation

- Space: 4, 8, 12, 16, 20, 24, 32.
- Radius: 10 controls, 14 rows, 18 cards, 999 pills.
- Elevation: cards use the existing `--elev1` plus the `--hair` top highlight; pressed state drops the shadow. The music dock keeps `--elev2`.

### Components (class names kept, values redesigned)

- `.btn`: 44 px default, 36 px `.small`. `.go` is the primary fill (brand), `.buy` is the coin action (brand outline), `.slip` is danger, `.ghost` is text only with a 44 px hit area, `.wide` full width. Press: scale .97 with `--spring`.
- `.panel`: surface-1, radius 18, padding 16, a section title row (`h2` Outfit 20/600 with an optional right-aligned count in mono).
- `.item` (quest, habit): 56 px minimum, leading emoji or icon, title (Karla 600 15 px), one meta line (13 px `--text-2`) that replaces the chip stack with a sentence such as "Hard, Work, due Fri", and one trailing primary control. Edit and delete stay as ghost icon buttons with `aria-label` (the tests and the a11y contract depend on them) but at reduced opacity until hover or focus, always at least 44 px.
- `.chip`: at most one per row in lists; in creation flows chips are 36 px tappable options with `.on` in `--brand-soft`.
- `.bar`: 6 px, radius 999. `.ring`: an SVG stroke ring (the Focus ring already exists, reuse its technique) for weekly targets and chest progress.
- `.scard`: reward card, radius 18, emoji icon, title, price in mono, one action.
- `.modal .box`: bottom sheet on phone (slides up, rounded top, drag-free), centered on desktop. Same markup.
- `.ebox`: empty state, emoji, one line, one primary button (existing, restyled).
- `.toast`: existing behaviour, restyled with surface-2 and a 3 px semantic edge.

### Icons

Inline SVG sprite (Lucide, MIT, fetched from the lucide repository at implementation time and committed) at the top of `<body>` in `index.html`: `<svg hidden><symbol id="i-home" viewBox="0 0 24 24">...</symbol>...</svg>`, used as `<svg class="i" aria-hidden="true"><use href="#i-home"/></svg>`. Icons: home, scroll-text, sprout, gift, bar-chart-3, timer, book-open, settings, check, plus, chevron-right, chevron-left, chevron-down, pencil, trash-2, flame, coins, star, sparkles, calendar, repeat, target, trophy, shield, heart, zap, moon, x, more-horizontal, arrow-up-right, sword, skull. Emoji stay for life areas, rewards, avatars, monsters and Sage.

### Motion

- View change: 140 ms fade plus 6 px rise (the existing `#view.view-nav` cascade, shortened).
- Completion: the check fills, the row lifts 2 px and settles into the done style, the existing `popCheck` burst and XP float stay.
- Sheet open: 220 ms rise on phone, 160 ms fade and scale on desktop.
- Everything off under `prefers-reduced-motion`, which is already global.

## Information architecture

Persistent header (all screens), rendered by `renderHUD()` into `#hud`, at most two slim rows on phone, one on desktop:

- Row 1: avatar (existing `aria-label="Customize character"`, tap opens the Hero sheet), name, the rank chip (existing `role="button"`), `Lv.N` in pixel type, then coins pill and streak pill (shield glyph when held), then the settings gear (stays in `.logo`).
- Row 2: the XP bar with the numbers inside, and the HP bar (existing `role="button"`) at 4 px, full width; the HP bar is visually faint at full health and red as it drops.

The full hero card (title picker, rank progress line, HP explanation, customize, life areas) lives in the Hero sheet (a modal opened from the avatar; `openCharacter()` is the base, extended with the rank and HP lines) and on Progress.

Life areas: `#skillsRow` stays in the shell and `renderSkills()` keeps writing into it (the tests count `.skillcard`), but a class on `#wrap` shows it only on Progress; the Hero sheet renders the same levels.

Primary navigation, five destinations, rendered by `renderTabs()` into `#tabs`, a fixed bottom bar on phone (existing breakpoint) and a top bar on desktop:

1. Today (`today`)
2. Quests (`quests`)
3. Habits (`habits`)
4. Rewards (`market`, the tab id stays)
5. Progress (`stats`, the tab id stays)

Focus (`focus`) and Journal (`journal`) keep their views and `go()` ids but leave the bar: `renderTabs()` renders only the five. Focus is launched from Today's quick actions and from a timer control on quest rows; the daily log lives on Today with an archive sheet. `go('focus')` and `go('journal')` still render those views with a back control in their header. Tests that count seven tabs move to five, `.tabs button.pri` becomes the three of Today, Quests, Habits.

## Screens

### Onboarding (first run)

Replaces the tutorial-then-form sequence with a six-step wizard. `boot()` calls `onboarding()` when there is no save. `tut(0)` keeps the educational slides for Settings "How it works". The spotlight tour (`startTour()`) still runs after the hero is created, with its steps updated to the new layout (header, tab bar, Today's Now card, Rewards, Progress, Sage).

Every step: a top progress bar (`.tdots` kept as the step indicator), a title in Outfit, at most one line of copy, chips or cards, a primary Continue, a Back, and Skip from step 3 on. No paragraphs.

1. Your hero: name (`#obName`, the only required typing, `obNameCheck` kept), avatar picker (`avPickerHtml('onboarding')` kept), theme row (`.obthemes` kept, live preview kept).
2. Your path: the existing `.pathpick` multi-select of `RPG.PATHS` cards (icon, name, blurb).
3. Your day: two chip rows. Time per day (15, 30, 60 or more minutes) and biggest struggle (Phone, Procrastination, Sleep, Junk food, None).
4. Habits to start: the good habits the chosen paths would seed, shown as toggle rows (on by default) with a target chip (3x, 5x, daily); the struggle adds one matching monster row (on by default). Suggestions are computed by running `RPG.seedPreset(RPG.newState('preview', avatar), pickedPaths)` on a throwaway state and reading it, no engine change.
5. First quests: the seeded quests as toggle rows. The time budget sets how many dailies start on (15: two, 30: three, 60: all). One optional custom quest field.
6. Rewards: the seeded market items plus catalog suggestions matching the struggle and paths, as toggle cards; three on by default.

Ready screen: the hero, three lines (earn, keep the streak, spend), the `#obStart` button ("Start"). `createHero()` runs `RPG.seedPreset` for real, then removes the toggled-off items through `RPG.actions.deleteQuest`, `deleteHabit` and `removeShopItem` (existing actions), adds the monster with `addHabit({type:'bad'})`, applies the theme, persists, renders, confetti, and the tour after 700 ms. Cloud sign-up is offered by the existing nudge bar after the first completed quest, not during onboarding.

### Today (dashboard), `renderToday()`

Order, top to bottom:

1. Greeting line (Outfit 26) and the date. Downed, wounded and atonement banners keep their classes (`.downbar`, `.woundbar`, `.redeembar`) and render here only when active; the boss chip joins the greeting row.
2. Now: today's dailies and quests due today as `.item` rows with one-tap check; the chest ring on the right with `n/N` (`.chestchip` classes kept on the ring's label). Empty state offers Add a quest and Start focus.
3. Coming up: `RPG.actions.agenda` grouped Late, Today, Tomorrow, This week (`.ag` and `.ag.overdue` kept).
4. Habits today: good habits as a checklist with the weekly ring and a Done control; bad habits collapsed behind one "Slipped?" row that expands the monster list.
5. Log your day: the mood faces (`.moods button[aria-pressed]`), `#jNote`, the sleep quick buttons (`.hrbtn`, `#slHours`) and stars inline, one Save (`saveDailyLog()`), an Archive link that opens a sheet with `journalArchive()`.
6. Quick actions, a sticky row above the bottom bar on phone: Add (opens the smart add sheet), Focus (`go('focus')`), Ask Sage (`openSageChat()` when signed in, otherwise the briefing).

The cloud nudge (`.nudgebar`) becomes one dismissible line under the greeting. Sage's daily greeting renders as a slim banner in the same slot instead of the bubble.

### Quests, `renderQuests()`

- `bossStrip()` stays first in the view (asserted by tests): a hero row when a boss is set, a single compact "Set this week's boss" row otherwise.
- Main quests: `goalCard()` as a progress card (title, `n of N steps`, ring, `.goal .pct` kept), steps as `.step` rows with a check; the add-step field keeps `#step_{id}` and `#stepdue_{id}` but the difficulty select becomes chips. "Break it down with Sage" button on each card (signed in only, phase 9).
- Side quests and dailies as row lists; weekday chips (`.daysrow .dow`) show only in the add form and while editing.
- Smart add sheet (shared with Today): one `#qTitle` input with chips under it (difficulty, area, due, repeat). `RPG.parseTask(text, now)` pre-selects chips from plain phrases: "every day", "daily", "weekdays", "tomorrow", weekday names, "in N days", "easy", "hard", "epic". The existing `#qDiff`, `#qSkill`, `#qDue` remain as the hidden values behind the chips so `addQuest()` reads them unchanged. Dailies use the same sheet with Repeat on (`#dTitle`, `#dDiff`, `#dSkill` kept).

### Habits, `renderHabits()`

Grow and Fight sections with the row component. Good habits show `habitDots()`, the weekly ring or streak, and Done as the trailing primary. Monsters keep the slip mechanic, `.menacebar` and `.menaceTag`, with the warn tint instead of red backgrounds. Add uses the smart sheet with a target chip row; the existing `presetChips` render as chips.

### Rewards, `renderMarket()`

Tab id `market` stays; `shopTab` values `market`, `hotel`, `black` stay. The view becomes sections instead of a tab switcher:

1. Balance hero: coins, earned today, spent today, one line: "You earn coins by clearing quests and keeping habits. Spend them here, guilt free."
2. Suggested for you: catalog items (`PRESETS.shop` extended with `tags` per item in app.js) matching the user's paths and struggle, one tap to stock (`usePreset` kept).
3. Your rewards: the `market` items as `.scard` (`.shopgrid`, `.affbar`, `.price.surged`, `.cap`, `.cap.hit`, `.btn.buy[disabled]` kept). Surge stays as a small toggle with its one-line explanation.
4. Protection: the Streak Shield card with "Held" state and the line "Used automatically the first day you miss, so the streak survives". The Focus Elixir shows here when held.
5. Guilty pleasures: the `black` items with a `--warn` soft tint (`.scard.shady` kept) and the framing: "The treats you would rather not have right now. One costs coins and HP, the price climbs, and you can only cave twice a day. It beats lying to yourself." The `#sDmg` field stays in this section's add form.
6. Rest: the `hotel` items with "Heals HP, never surges, never capped".

The `.royaltab` and `openRoyalChamber()` are removed (phase 2). `docs/PREMIUM_SPEC.md` stays.

### Progress, `renderStats()`

1. Hero card: the full card with rank progress and the title picker.
2. This week: three rings (XP versus last week, habits kept %, focus minutes) and `reviewBox()` (`.review`, `.rv.suggest` kept) as the encouraging line.
3. Streak: `heatmapPanel()` (`.heatmap`, `.hc.lN` kept) with the current and best streak in big mono numbers.
4. Life areas: `#skillsRow` shown here (see IA).
5. XP over 7 days as an SVG bar chart that keeps the `.chart .col` structure the tests count (each bar is a `.col` containing the SVG rect), the mood strip, `sleepChartHtml()` restyled the same way.
6. `focusPanel()`, `insightsPanel()`, `trophyShelf()`, `leaderboardPanel()`, the achievements grid, the adventure log, all restyled with the same panel and row components.

### Focus, `renderFocus()`

Same state machine, calmer layout: the ring as the hero, mode chips, task and quest link as two rows, music as one row, one Start. A back control in the header returns to Today.

### Journal, `renderJournal()`

Kept as a view for `go('journal')` and the archive sheet; its form is the same markup Today embeds, so `saveDailyLog()` works from both.

### Settings, `openSettings()`

Grouped with small section labels: Character (character and theme, interactive tour, how it works), Sound and reminders, Difficulty (hardcore, rest days), Account and cloud (`cloudSection()`), Data (export, import, restore, diagnostics), Danger (reset), About (privacy, terms). The Royal Chamber entry is removed.

## Sage in the flows

- Break it down (phase 9): a `propose_steps` tool in the Edge Function returns `{main_quest_id, steps:[{title, difficulty}]}`; the client shows one card listing the steps with checkboxes and an "Add selected" button, and adds each through `sageApplyAction('add_quest', {title, difficulty, main_quest_id})`. Nothing saves until the user taps.
- The rest stays as shipped: memory, several actions per turn, confirm cards, the chat cue.

## Phases (one commit each, in order)

1. Design system, header, sprite: tokens, type, icons, component restyle, compact header and Hero sheet, skills row gating. No behaviour change.
2. Remove the premium tier.
3. Navigation: five destinations, Focus and Journal relocated, Progress absorbs the hero card and life areas, tour steps updated.
4. Today dashboard.
5. Onboarding wizard.
6. Smart add: `RPG.parseTask`, the add sheet, chips for quests, dailies, steps and habits.
7. Rewards.
8. Progress.
9. Sage: break it down.
10. Polish: empty states, motion, accessibility pass, phone QA on every screen, security review, PR.
