# Premium Tier Spec (roadmap item 2)

Status: living spec, owner-locked direction. Spec only, no app code yet.
Grounding: `THEMES` (6 themes) and `AVB`/`SVG_AVATARS` in `app.js`, `FRAMES` (6 chest-loot frames) and `ACHIEVEMENTS` titles in `core.js`, Stats/insights panel in `app.js`.

## 1. Goal & non-goals

**Goal.** A cosmetic-only premium tier that funds the project without touching its identity: free, offline-first, no ads, no tracking, never pay to win. Premium extends existing cosmetic systems; it never adds power.

**Non-goals.**
- No payment processing details here (Phase B decides the rail; keys never client-side).
- Nothing pay-to-win: no XP boosts, no coin bonuses, no streak protection, no shields, no extra chest odds for money. Ever.
- No build step, no new dependencies, no framework. Static files only.
- No change to what free users have today. Everything currently shipped stays free.

## 2. The three perk cards

Exactly three cards, each extending a system that already exists.

**Card 1: Royal Themes** (extends `THEMES` in `app.js`)
Four premium themes in the same object format (bg/panel/panel2/line/accent): Obsidian (near-black, silver accent), Aurora (deep teal, shifting green-violet accent), Sakura (dusk plum, blossom pink), Starfield (ink blue, comet white). Rendered as locked swatches next to the six free themes in Settings. Small lift: new entries in one constant plus a lock check.

**Card 2: Legend's Wardrobe** (extends `FRAMES`, `AVB`, and wearable titles)
- Three exclusive frames in the `FRAMES` format with a soft animated glow (CSS only): Eclipse, Prism, Dragonfire. Chest loot keeps dropping the six free frames unchanged.
- Extra `AVB` builder layers: +4 outfit colors, +2 hair styles, +2 accessories (must still encode in the 5-char token so it syncs; flag to engineering if token space is tight, this may be a bigger lift than it looks).
- Shimmer title style: your worn achievement title gets a subtle animated gradient. Titles themselves stay earned by play; premium only styles them.

**Card 3: Sage's Ledger** (extends the Stats/insights panel)
Informational only, no power: yearly activity heatmap, per-skill XP trend lines, best focus hours, habit consistency percentages, weekly recap card. All computed locally from existing state, offline like everything else.

## 3. Pricing

**Founder, 19 EUR one time (hero offer, shown first and biggest).**
Everything above, forever. All future premium cosmetics included. Plus an exclusive Founder badge and wearable Founder title that will never be sold again after launch window.

**Royal, 2.49 EUR / month.**
Everything above while subscribed. Cosmetics unlocked by it re-lock if the sub lapses (worn theme falls back to a free one; nothing earned by play is ever lost).

**Anchoring rationale.** Founder sits above the subscription visually and in emphasis so 19 EUR reads as the deal: less than 8 months of Royal, permanent, plus a scarce badge. The monthly option exists to make the one-time price feel obviously better and to catch users who never buy one-time. Solo-founder reality also favors one-time purchases: less billing support, no churn management, and Founder buyers are exactly the early community Mehmet wants before launch.

## 4. Screen layout

**Where it lives.** One screen, dark, matching the default Dungeon theme (`bg #12101f`, gold accent `#f5c542`), regardless of the user's active theme so it always looks premium. Entry points:
- Settings: a "Royal Chamber" row under the theme picker.
- Market tab: a fourth tab or banner row "Royal" beside market/hotel/black market.

**Section order (top to bottom).**
1. Header: crown icon, title, one-line subtitle.
2. Founder offer card (large, gold border, the anchor).
3. Royal monthly card (smaller, below).
4. The three perk cards in a row/stack (locked previews: theme swatches, glowing frame ring, sample insight chart).
5. Footer promise (see copy in section 6).

**States.**
- Free user: both offers visible, perks shown locked with previews.
- Founder: offers replaced by "You are a Founder" banner with the badge; perks shown unlocked.
- Subscriber: "Royal active" banner with renewal note and a quiet upgrade line to Founder (price difference framed simply, no pressure).
- Phase A only: purchase buttons replaced by the coming-soon state (section 5).

## 5. Phasing

**Phase A (now, shippable pre-launch).** Build the screen with all perks visible but purchases disabled: buttons read "Coming soon". No waitlist, no email capture (no tracking promise stays intact). Purpose: signal the roadmap, test the pitch with the friend testers, gather reactions in feedback.

**Phase B (payments).** Stripe Payment Links or similar, opened in a new tab. Fulfillment via webhook to a Supabase Edge Function; all keys server-side. The client never talks to Stripe directly beyond opening the link.

**Phase C (entitlements).** A Supabase `entitlements` table (user_id, tier, granted_at, expires_at), written only by the Edge Function service role, readable by the owning user via RLS. Client caches the entitlement in local state so cosmetics work offline; re-checks on sync. Honest lock only: it gates CSS and constants, and that is fine, cheaters gain nothing tradable.

## 6. Copy draft (every visible string)

Rules: no em-dashes anywhere, no sword emoji, playful RPG voice, second person, short lines.

- Screen title: **The Royal Chamber**
- Subtitle: *Dress your legend. Your climb stays free, always.*
- Founder card title: **Founder's Crest**
- Founder price line: **19 EUR, once. Yours forever.**
- Founder body: *Every royal perk, for life. Every future one too. Plus the Founder badge, only for those who were here first.*
- Founder button: **Become a Founder**
- Monthly card title: **Royal Pass**
- Monthly price line: **2.49 EUR / month**
- Monthly body: *All royal perks while your pass is active.*
- Monthly button: **Go Royal**
- Perk card 1 title: **Royal Themes** / body: *Four new realms for your interface. Obsidian, Aurora, Sakura, Starfield.*
- Perk card 2 title: **Legend's Wardrobe** / body: *Glowing frames, new hero styles, and a shimmer on your title.*
- Perk card 3 title: **Sage's Ledger** / body: *The owl opens his ledger. Deep charts on your habits, focus, and skills.*
- Phase A button (both offers): **Coming soon**
- Phase A note: *The chamber opens after launch. Everything you see stays cosmetic.*
- Founder state banner: **You are a Founder.** *The realm remembers.*
- Subscriber state banner: **Royal Pass active.** *Renews monthly. Cancel anytime.*
- Subscriber upgrade line: *Prefer forever? Founder's Crest is 19 EUR, once.*
- Footer promise: **Never pay to win.** *No XP for money. No shields for money. No shortcuts, ever. Premium is style and stats, nothing else. Quests, habits, focus, and streaks are free for everyone, forever.*
- Settings entry row: **The Royal Chamber** with hint *Cosmetics and deep stats. Never power.*
- Market entry label: **Royal**

## 7. Open questions for Mehmet

1. Should the Founder badge appear on the public leaderboard profile (would need a 7th shared field, currently six by design)?
2. Founder scarcity: sold forever, or genuinely retired after a launch window (e.g. first 3 months)? Copy above promises retirement.
3. On sub lapse, do already-applied cosmetics soft-lock immediately or at next app open? (Recommend next open, gentler.)
4. Market tab entry: full fourth tab or just a banner row? A tab is more visible but crowds mobile.
5. Price check: 19 EUR / 2.49 EUR are placeholders within your locked range. Confirm exact figures before Phase B, including whether to show local currency.
