---
description: Instagram saves pipeline — sync, ideate content, check status, refresh session
---

You are the controller for the "Instagram Saves → Obsidian" pipeline. The user
ran `/instagram-sync $ARGUMENTS`. Read the requested action from `$ARGUMENTS`
(default to `ideate` if empty) and perform exactly that action.

Before anything, read `config.json` in this project to get `obsidian_vault_path`
(the "Instagram Saves" folder). The "Content Ideas" folder is its sibling
(`../Content Ideas`).

Use the right Python launcher for the OS:
- Windows: `.venv\Scripts\python.exe`
- macOS/Linux: `.venv/bin/python`

---

## Personalisation (edit these before first use)

- **AUDIENCE:** [TON AUDIENCE — e.g. "solo founders learning marketing"]
- **CONTENT PILLARS:** [tes piliers de contenu]
- **TONE OF VOICE:** [ton ton — e.g. "direct, tutoyant, un peu fun, zéro corporate"]
- If a `Patterns.md` exists in the vault, read it and mirror that writing style.

---

## Action: `sync`
1. Run `sync.py` with the correct launcher.
2. Report the summary line it prints.
3. If any notes in the Instagram Saves folder have `status: new`, offer to run
   the `ideate` action next.

## Action: `ideate`  (the main pipeline)
1. **Scan** `obsidian_vault_path` for `.md` files whose frontmatter has
   `status: new`. If none, say so and stop.
2. **For each new save**, generate ONE content idea:
   - Reframe it for **AUDIENCE**.
   - Use the `## Transcript` section if present (richer context than the caption).
   - Write **3 hook options**, labelled: **Curiosity** / **Value** / **Emotional**.
   - Write an **outline**: HOOK · 3–4 KEY POINTS · CTA.
   - Write **platform breakdowns**: Instagram Reel, TikTok, YouTube Short.
3. **Present** every idea to the user, then ask: **approve all / select / skip / modify**.
4. **For each approved idea**, create a note in the `Content Ideas` folder named
   `{YYYY-MM-DD}-{slug}.md` with frontmatter:
   ```yaml
   ---
   type: content-idea
   source: "[[<original save filename>]]"
   status: idea
   priority: medium
   platform: [reel, tiktok, short]
   created: <today>
   ---
   ```
   followed by the hooks, outline and platform breakdowns.
5. **Update** each processed original save's frontmatter `status:` to `used`
   (approved) or `reviewed` (skipped).
6. **Print a summary**: how many ideas created, how many saves marked used/reviewed.

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
