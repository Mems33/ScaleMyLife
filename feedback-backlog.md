# Feedback backlog

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
- [ ] **Part 2 of the site analysis** — arrives next session as **Update 2**.
- [ ] **True background push notifications** (web push) — current reminders fire only while the app is open; needs a backend phase.
- [ ] **Avatar builder extensions** — more layers (gear, faces), per-theme hero variants.
- [ ] **Opt-in remote error reporting** — the local 🩺 Diagnostics ring buffer could push to a Supabase table for real monitoring.
