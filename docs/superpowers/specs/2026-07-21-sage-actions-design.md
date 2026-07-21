# Sage Actions — Design

## Context

Sage Phase 2 (real chat via the `sage-chat` Supabase Edge Function) is live and
verified working end-to-end. Feedback from first live testing: Sage can talk
but can't act, which caps how useful it feels. This spec covers giving Sage a
bounded set of actions it can actually perform on the user's behalf, driven by
Claude tool-use.

## Goals

- Sage can add a quest, add a habit, complete a quest, complete a habit, and
  log mood/sleep — triggered by asking in chat.
- The engine stays 100% client-authoritative. Claude only *decides* an action;
  the client's existing `core.js` functions are what actually mutate state,
  exactly as if the user had clicked the equivalent button.
- No new server-side copy of game logic. No new trust boundary — the Edge
  Function still never sees or writes the user's save row.

## Non-goals (later, not v1)

- Delete/edit actions, market purchases, skill/life-area edits, starting focus
  runs, or anything else not in the table below.
- A multi-turn agentic loop (Claude calling multiple tools across several
  hops in one request). Each chat turn results in at most one action.

## Action set & confirmation tiers

| Action | Tool name | Confirm? |
|---|---|---|
| Mark a quest done | `complete_quest` | Auto-apply (existing Clear/undo path already covers reversal) |
| Mark a habit checked | `complete_habit` | Auto-apply |
| Log mood/sleep | `log_mood` | Auto-apply |
| Add a new quest/side quest | `add_quest` | Confirm first — Sage is guessing title/difficulty/XP/deadline from phrasing |
| Add a new habit | `add_habit` | Confirm first — same reasoning (frequency/difficulty guessed) |

Auto-apply actions show a toast ("Sage did X — Undo", reusing the existing
toast pattern in `app.js`) for a few seconds rather than a full confirm gate.
`add_quest`/`add_habit` show an inline chat card with the proposed item and
Yes/Cancel buttons; nothing is written until Yes.

## Data flow

1. Client sends `message`, the existing `brief` one-liner, and a new compact
   `today` payload: today's active quests and habits as `{id, title, kind}`
   only — no XP/coin values, no history. Capped at ~1200 chars
   (`MAX_TODAY_LEN`), truncated oldest-first if over.
2. The Edge Function adds a `tools` array to the Anthropic Messages API call:
   five tool definitions matching the table above, each with a strict JSON
   schema (e.g. `complete_quest` requires `quest_id`, one of the ids sent up
   this turn; `add_quest` requires `title`, optional `difficulty`/`due`;
   `add_habit` requires `title`, optional `difficulty`/`days`).
3. If Claude's response contains a `tool_use` block, the Edge Function returns
   `{reply: <any accompanying text>, action: {type, params}}` instead of
   executing anything itself. If absent, behavior is unchanged from today
   (`{reply}` only).
4. Rate limiting is unchanged (30/day via `sage_usage` RPC) — actions don't
   get a separate budget; they're still one chat turn.

## Client changes

- `sageSend()` in `app.js` gets a new branch: if `r.action` is present, render
  the appropriate card/toast and wire its button to the matching `RPG.*` call
  (`RPG.addQuest`, `RPG.addHabit`, `RPG.completeQuest`, `RPG.completeHabit`,
  `RPG.logJournal` for `log_mood`), then `persist()` and re-render exactly as
  any existing UI action does.
- A `SAGE_ACTIONS` whitelist map in `app.js` (keyed by the five tool names
  above) is checked before anything runs — an unrecognized `action.type` from
  the network is inert by default. This is defense in depth; it doesn't rely
  on trusting the server response.

## Safety rails

- Server-side: tool JSON schemas constrain what Claude can ask for at all
  (e.g. `quest_id` must reference something sent up this turn).
- Client-side: the `SAGE_ACTIONS` whitelist, plus the fact that
  `RPG.addQuest`/`RPG.completeQuest`/etc. are the same functions the UI
  buttons already call — no new validation surface.
- Existing message-length caps and the 30/day rate limit are untouched.

## Testing

- `test-ui.js` gains cases: a tool-call response renders the right card;
  confirming an `add_quest`/`add_habit` card applies the mutation and
  persists; cancel discards it; auto-apply actions show the undo toast; an
  unrecognized `action.type` is silently ignored.
- The Edge Function itself isn't unit-tested today (deployed via the Supabase
  MCP, no local Supabase project link). Verify each action type manually
  against the live function after deploying, the same way plain chat was
  just verified.
