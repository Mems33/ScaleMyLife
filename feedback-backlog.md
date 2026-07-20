# Feedback backlog

## Done — 2026-07-21 session (Update 2 + Premium Phase A)

Shipped to main in 10 merged batches, 813 → 851 tests, all green, browser-QA'd:
tabbed avatar picker + Customize button; Coder/Gamer life paths; tutorial copy
(XP/HP explicit, Sage + side quests covered, no ascend up front); unified daily
log (mood + sleep, one button, 7/8/9h quick buttons, live star feedback); ⚡
Quick Add panel on Today; weekly boss due by Sunday with a week picker; life
areas emoji picker + 12-area cap + starter use cases for Social/Money; chest
odds preview + rattle-and-reveal + all-habits bonus (+20 coins); focus sessions
link to main AND side quests (banked ⏳ time on the row); movable/resizable
docked music player; new music (Epic Chinese, Valhalla, Minecraft) + lofi fix;
glowing titles + one-tap title picker in the hero bar; deadlines on Today;
"lundi" locale bug fixed; input-wipe-on-select bug fixed app-wide; premium spec
(docs/PREMIUM_SPEC.md) + The Royal Chamber coming-soon screen.

## TODO — pending / unfinished (as of 2026-07-21)

### From this session (Update 2 leftovers)
- [ ] **Title sharing on the leaderboard** — branch `title-sharing-leaderboard` is ready but UNMERGED: first run the migration at the bottom of `supabase/leaderboard.sql` (adds a capped `title` column), then merge. Merging first would break every profile push.
- [ ] **Verify on the live site**: new lofi mix + Epic Chinese / Valhalla / Minecraft embeds actually play; docked player drag/resize on touch devices.
- [ ] **Ambient background animals** (birds/critter shadows, rare and subtle) — deliberate art direction task, not a quick patch; needs a design pass so it doesn't cheapen the gradient.
- [ ] **Friends by username instead of code** — needs a unique-name story (names aren't unique today) or search-by-name RPC with rate limiting; design first.
- [ ] **Richer leaderboard profiles** (trophies, achievements, life-area levels) — expands the shared-data surface; decide what's public before any schema work.
- [ ] **Vacation freeze mode** (pause the whole account vs rest days) — open design question; rest days + Streak Shield already cover most cases, a full freeze risks becoming a disguised streak-kill switch.
- [ ] **Hotel / Black Market rethink** — owner wants a partial redesign; collect friend-tester reactions first.
- [ ] **Premium Phase B/C** — Stripe Payment Links via Edge Function, then RLS entitlements table (see docs/PREMIUM_SPEC.md §5); blocked on launch + real users.
- [ ] **Premium spec open questions** — five questions at the bottom of docs/PREMIUM_SPEC.md need owner answers (founder scarcity window, exact prices, badge on public profile, market entry style, lapse behavior).

## TODO — pending / unfinished (as of 2026-07-20)

### Security & infrastructure
- [ ] **Enable leaked-password protection** in Supabase Auth — deferred: requires the Pro plan; passwords remain bcrypt-hashed and rate-limited meanwhile.
- [ ] **Rate-limit / captcha the friend-code lookup at scale** — codes are 32-bit behind an authenticated-only RPC; fine at today's size, harden if the user base grows.
- [ ] **Supabase Pro for daily database backups** — the recovery story today is localStorage + cloud row + manual JSON export; no server-side point-in-time restore.
- [ ] **Sage Phase 2 (LLM chatbot) via Supabase Edge Function** — Anthropic API key server-side only, request validation + rate limiting before the model, deterministic RLS permissions; blocked on an API key being provided.
- [ ] **Save-history table for point-in-time recovery** (idea) — cloud currently keeps only the latest save row.

### Needs verification on the live site (can't be tested from the dev sandbox)
- [x] **Canonical URL confirmed** — `https://scale-my-life.vercel.app` (from the vault's project note); meta tags, `sitemap.xml` and `robots.txt` updated to it.
- [ ] **One-time PWA refresh on phones** — fully close and reopen the installed app (twice if needed, or re-add from Safari) so the new auto-update mechanism takes over; updates are automatic afterwards.
- [ ] **Password-reset flow end-to-end** — request the email on the live site, open the link on the same device, set a new password.
- [ ] **Break alarm audibility on iPhone** — WebAudio unlock + resume shipped; confirm the bell actually sounds at break time on the device.
- [ ] **Reminders from the installed iOS PWA** — iOS only exposes notifications to Home-Screen apps; confirm the permission prompt and the test notification fire there.
- [ ] **Focus music on the hosted site** — the inline YouTube player renders on the Focus tab, and the docked mini-player keeps playing across tab switches.

### Owner-account tasks (need Mems33 logins)
- [ ] **Google Search Console** — verify the site, submit `sitemap.xml`.
- [ ] **Bing Webmaster Tools** — same.
- [ ] **Marketing/launch items** from the launch checklist — launch post, social assets, Product Hunt listing if used.

### Product
- [x] **Part 2 of the site analysis** — shipped 2026-07-21 as **Update 2** (see Done section above).
- [ ] **True background push notifications** (web push) — current reminders fire only while the app is open; needs a backend phase.
- [ ] **Avatar builder extensions** — more layers (gear, faces), per-theme hero variants.
- [ ] **Opt-in remote error reporting** — the local 🩺 Diagnostics ring buffer could push to a Supabase table for real monitoring.
