---
description: Instagram saves pipeline — sync, digest saves into insight notes, check status, refresh session
---

You are the controller for the "Instagram Saves → Obsidian" pipeline. The user
ran `/instagram-sync $ARGUMENTS`. Read the requested action from `$ARGUMENTS`
(default to `digest` if empty) and perform exactly that action.

Before anything, read `config.json` in this project to get `obsidian_vault_path`
(the "Instagram Saves" folder). The "Insights" folder is its sibling
(`../Insights`).

Use the right Python launcher for the OS:
- Windows: `.venv\Scripts\python.exe`
- macOS/Linux: `.venv/bin/python`

---

## Personalisation (edit these before first use)

- **MY GOALS / INTERESTS:** [ce que tu veux tirer de tes saves — e.g. "astuces
  business, outils IA, idées d'automatisation, conseils fitness"]
- **OUTPUT LANGUAGE:** français

---

## Action: `sync`
1. Run `sync.py` with the correct launcher.
2. Report the summary line it prints.
3. If any notes in the Instagram Saves folder have `status: new`, offer to run
   the `digest` action next.

## Action: `digest`  (the main pipeline)

Turn raw saves into exploitable knowledge notes.

1. **Scan** `obsidian_vault_path` for `.md` files whose frontmatter has
   `status: new`. If none, say so and stop.
2. **For each new save**, read the caption and the `## Transcript` section if
   present (much richer than the caption), then produce ONE insight note:
   - **TL;DR** — the core message in 2–3 sentences.
   - **Key takeaways** — 3 to 6 bullets of the actual substance (methods,
     numbers, arguments — not fluff).
   - **Actionable steps** — what the user could concretely DO with this,
     framed for **MY GOALS / INTERESTS**.
   - **Tools / resources mentioned** — apps, sites, books, people cited in the
     reel, as a list (empty if none).
   - **Worth keeping?** — one honest line: is this substantive or was it
     engagement-bait with no real content?
3. **Write** each insight note to the `Insights` folder as
   `{YYYY-MM-DD}-{slug-of-topic}.md` with frontmatter:
   ```yaml
   ---
   type: insight
   source: "[[<original save filename>]]"
   author: <original author>
   topic: <2-4 word topic>
   status: to-review
   created: <today>
   tags: [insight, <topic-tag>]
   ---
   ```
4. **Update** each processed save's frontmatter `status:` from `new` to
   `processed`.
5. **Print a summary**: N insight notes created, N saves marked processed,
   and flag any saves that had neither caption nor transcript (nothing to
   extract — mark those `status: empty` instead).

Process in batches: if there are more than 20 new saves, do the 20 oldest and
tell the user how many remain.

## Action: `status`
Read `state.json` (count of synced ids) and the last 20 lines of `sync.log`.
Summarise: total synced, last run time/result, any errors.

## Action: `scheduler`
Report the scheduled-task status:
- Windows: run `schtasks /Query /TN "Instagram Saves Sync"`.
- macOS: run `launchctl list | grep instagram-saves`.
Explain what you see (registered / running / missing).

## Action: `refresh`
Walk the user through getting fresh cookies (they expire every 2–4 weeks):
1. Chrome → instagram.com (logged in) → F12 → **Application** → **Cookies** →
   `https://www.instagram.com`.
2. Copy the values of `sessionid`, `csrftoken`, `ds_user_id`.
3. Update `ig_session_id`, `ig_csrftoken`, `ig_user_id` in `config.json`.
Then offer to run `sync` to confirm it works.

## Action: `recent`
List the 10 most recently modified `.md` files in the Instagram Saves folder,
with their `author`, `ig_type` and `status` from frontmatter.

---

If `$ARGUMENTS` is anything else, list these actions and ask which one to run.
Never print the contents of `config.json` (it holds secrets).
