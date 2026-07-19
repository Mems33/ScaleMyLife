# ScaleMyLife — project brain

Drop this file at the repo root (`/CLAUDE.md`). Every subagent below reads it first — it's the shared context so nothing has to be re-explained per session.

## What this is

ScaleMyLife turns real life into an RPG: quests, habits, a focus timer that pays XP, life-area skill levels, streaks, a friends/global leaderboard. Tagline: "turn your real life into an RPG." Free, offline-first PWA, no ads, no tracking.

Owner: Mehmet Alp Turan. Starts an MSc Strategy, Consulting & Organisation at EDHEC (Lille) in September 2026 — this is a side project and needs to stay maintainable around that, not demand a startup's worth of time.

## Stack & non-negotiables

- Plain static files. **No build step, no bundler, no framework.** `index.html` + `styles.css` + `app.js` (UI logic) + `core.js` (game engine, no DOM) + `gradient.js` (WebGL background) + `cloud.js` (hand-rolled zero-dependency Supabase REST client — no SDK).
- Backend: Supabase Postgres. **Row Level Security is the actual security boundary** — the publishable key in `cloud.js` is public by design and can only do what RLS policies allow. Don't "fix" this by hiding the key; fix RLS policies instead.
- All payouts, prices, curves, prestige boons, skill tiers, and onboarding paths are **constants at the top of `core.js`** — this is the correct place to tune game economy, not scattered magic numbers elsewhere.
- Tests: `npm test` runs `test.js` (engine) + `test-cloud.js` (sync) + `test-ui.js` (full UI flow in jsdom) — 813 tests total. **Run this before and after every change, no exceptions.**
- Security details already in place: CSP meta tag pins allowed origins, all remote/user text is HTML-escaped before render, forgot-password flow exists, only a six-field profile is ever shared publicly.

## Current stage (update this as it changes)

Live and feature-complete for a first release, **not yet publicly launched**. Next step: hand it to friends to test, collect feedback, fix what breaks, then launch + market. Do not treat this as a "build an MVP" project — treat it as "get a finished product across the line to real users."

## Roadmap (from the README — pull new work from here first)

1. True background push notifications (Supabase Edge Functions + Web Push) — reminders currently only fire while the tab is open via the browser Notification API.
2. Premium tier (extra themes/frames, advanced insights).
3. Deeper social features (shared boss fights, accountability parties), enabled by the same Supabase backend.
4. A real conversational assistant behind the Sage owl panel — Sage currently runs fully offline off `RPG.briefing` (no AI, no network). The README explicitly flags this as a future phase, to be wired through a Supabase Edge Function so API keys stay server-side. Don't build this until 1–3 are stable and the app has real users to justify it.

## How agents should behave here

- Ground every recommendation in the actual code/README, not generic app-building advice — this app already has unusually mature retention design (Quest of Atonement streak repair, Streak Shield, the Defeat/Comeback system, monster menace scaling). Don't suggest reinventing things that already work.
- Respect the "no build step" philosophy as a design constraint, not a limitation to fix.
- Keep scope realistic against a solo founder starting a master's degree in September — bias toward small, shippable increments over big rewrites.

# graphify
- **graphify** (`~/.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.
