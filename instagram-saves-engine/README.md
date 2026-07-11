# Obsidian Insta Brain

Turn your Instagram saves into a second brain, automatically.
A Python pipeline that pulls your saved posts once a day into your Obsidian
vault, transcribes reels, and extracts the exploitable information (summaries,
key points, concrete actions, tools mentioned) via a Claude Code slash command.

> Based on the **"Instagram x Obsidian"** guide by 0xLoucash. The scripts the
> guide has you generate with Claude Code are **already written here** — you
> only configure and run.

## What it does

| File | Role |
|---|---|
| `sync.py` | Pulls your Instagram saves → writes one `.md` per post into your vault. Dedups via `state.json`. |
| `enrich.py` | Transcribes each reel via the ScrapeCreators API → the audio content becomes searchable in Obsidian. |
| `.claude/commands/instagram-sync.md` | Slash command `/instagram-sync digest` → extracts the substance of your saves into insight notes. |
| `scheduler/…plist` | Daily auto-sync on macOS (launchd). Windows uses Task Scheduler (below). |
| `vault-template/` | The folder structure to copy into your Obsidian vault. |

## Security — read this first

- Your Instagram `sessionid` **= your password**. Never share it, never commit it.
- `.gitignore` already excludes `config.json`, `state.json`, `sync.log`, `enrich.log`, `.env`, `.venv/`. Keep it that way.
- Only use this on **your own account**.

### Instagram ban risk — the honest picture

This script uses Instagram's private web API with your session cookies — the
exact same calls your browser makes when you open your saves. It technically
goes against Instagram's ToS (automation), so the risk is **never zero**. But
it is low if you stick to the intended usage profile, because the script is
**read-only** (it never likes, follows, comments or posts — the behaviours
that actually trigger bans) and **very low volume**.

What keeps it quiet by nature:
- 1 sync/day, a 1-second pause between pages, ~50 posts per page.
- Read-only: no visible action on Instagram's side.
- Your real browser's session, a standard desktop User-Agent.

What can happen in practice (most likely first):
1. **Session invalidated** — Instagram logs you out, the script prints
   "Invalid session". No sanction: just grab fresh cookies.
2. **"Suspicious activity" checkpoint** — Instagram asks you to confirm your
   identity at next login. Annoying, not a sanction.
3. **Temporary action block / ban** — essentially unheard of for personal
   read-only use at this volume. Bans target action automation (mass-like,
   mass-follow, large-scale scraping of other accounts).

Rules to stay in the green zone:
- **Run it from your own computer, on your home connection** (not a VPS, not
  a country-hopping VPN). A session appearing from a datacenter IP is the
  single most suspicious signal there is.
- **Don't shorten the pauses, don't raise the frequency.** Once a day is
  plenty — your saves don't move that fast.
- **First run is the biggest** (it pages through your whole save history).
  With 500+ saves, use `collections_filter` to narrow it down, or let it run
  once and finish quietly — after that, every run only touches the delta.
- **One automation tool per account.** If another bot/scheduler already runs
  on this account, the signals add up.
- Never share your configured copy (with `config.json`) with anyone, and
  don't deploy it at scale.

**The 100% risk-free alternative**: Meta's official export (Instagram →
Settings → Accounts Center → Your information and permissions → **Download
your information** → select "Saved" content). You get a JSON of all your
saves through an official feature — a ban is impossible. Downsides: it's
manual (no auto-sync), you must re-request it each time, and preparation
takes minutes to hours. If any risk at all is unacceptable to you, start
there — the rest of the pipeline (enrich + digest) works the same once the
notes are in Obsidian.

---

## Setup (30–45 min)

### 1. Architecture — keep the code out of the vault

This project folder is the **code**. It must live **outside** your Obsidian
vault (e.g. `~/Code/` or `C:\Users\YourName\Code\`).

Copy the **contents** of `vault-template/` into your vault. You end up with:

```
Insta Brain/                  ← your Obsidian vault
├── Instagram Saves/          ← sync.py writes here
├── Insights/                 ← /digest writes here
└── _Index - Insta Brain.md
```

> If the code folder ever ends up inside the vault by accident, create a
> `.obsidianignore` file at the vault root containing the folder name.

### 2. Grab your Instagram cookies (3 min)

1. In Chrome, log in at **instagram.com**.
2. Press `F12` (Windows) / `Cmd+Option+I` (Mac) → **Application** tab.
3. Left sidebar → **Cookies** → `https://www.instagram.com`.
4. Copy the **Value** of these 3 cookies:

| Cookie | What it looks like |
|---|---|
| `sessionid` | the whole value (`78230401234%3AABC...`) |
| `csrftoken` | ~32 characters |
| `ds_user_id` | a number (your Instagram user ID) |

> ⚠️ These cookies expire every **2–4 weeks**. When the sync says
> "Invalid session", just redo this step.

### 3. Fill in `config.json`

```bash
cp config.example.json config.json           # macOS/Linux
Copy-Item config.example.json config.json    # Windows PowerShell
```

Fill it with your real values. **`obsidian_vault_path` must point EXACTLY at
the `Instagram Saves` subfolder**, not its parent:

```json
{
  "ig_session_id": "…",
  "ig_csrftoken": "…",
  "ig_user_id": "…",
  "obsidian_vault_path": "C:/Users/YourName/Documents/Insta Brain/Instagram Saves",
  "collections_filter": ["Inspiration", "To Process"],
  "scrapecreators_api_key": "PASTE_YOUR_SCRAPECREATORS_KEY_HERE"
}
```

**`collections_filter`** syncs only the Instagram collections you name (create
collections in the Instagram app first: long-press the save icon on a post →
save to a collection). Match the names exactly as they appear in Instagram.
Use `[]` to pull everything.

### 4. Install dependencies

**macOS / Linux:**
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**Windows (PowerShell):**
```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

> If PowerShell blocks `Activate.ps1`, no problem: just use
> `.\.venv\Scripts\python.exe` directly for every command.

### 5. First sync

```bash
python sync.py                       # macOS/Linux
.\.venv\Scripts\python.exe sync.py   # Windows
```

You should see:
```
Instagram session valid for @your_username
Fetching saved posts...
Found 3 collections
Sync complete: 47 new | 0 skipped | 47 total | 0 errors
```

Open Obsidian → `Instagram Saves/` → `.md` files with `status: new`. 🎉

### 6. Daily auto-sync

**macOS (launchd):**
1. Edit `scheduler/com.loucash.instagram-saves-sync.plist`: replace
   `ABSOLUTE_PROJECT_PATH` with this folder's absolute path (`pwd`).
2. Install:
   ```bash
   cp scheduler/com.loucash.instagram-saves-sync.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.loucash.instagram-saves-sync.plist
   launchctl list | grep instagram-saves   # verify
   ```

**Windows (Task Scheduler):**
- Task Scheduler → **Create Task** (not "Basic Task").
- **General**: name `Instagram Saves Sync`, tick "Run whether user is logged on or not".
- **Triggers** → New: Daily, 9:00 AM, recur every 1 day.
- **Actions** → New:
  - Program: `C:\Users\YourName\Code\obsidian-insta-brain\.venv\Scripts\python.exe`
  - Arguments: `sync.py`
  - Start in: `C:\Users\YourName\Code\obsidian-insta-brain`
- Verify: `schtasks /Query /TN "Instagram Saves Sync"`

> Always use **absolute** paths in the scheduler.

### 7. Bonus — reel transcripts (ScrapeCreators)

1. Create an account at **scrapecreators.com**, grab your API key (free to try).
2. Put it in `config.json` → `scrapecreators_api_key`.
3. Run:
   ```bash
   python enrich.py                       # macOS/Linux
   .\.venv\Scripts\python.exe enrich.py   # Windows
   ```
Each reel gains a `## Transcript` section + `transcript: true` in its
frontmatter. You can schedule `enrich.py` 5 minutes after the daily sync.

### 8. Slash command — extract the insights

Open Claude Code in this folder, then:
```
/instagram-sync digest
```
Claude reads your `status: new` saves (with transcripts) and writes one note
per save into `Insights/`: TL;DR, key takeaways, concrete actions,
tools/resources mentioned, and an honest verdict (real substance or
engagement bait). Originals are marked `status: processed`.

> **Personalise first**: edit the top of `.claude/commands/instagram-sync.md`
> with your goals and interests — that's what steers the extraction toward
> what's actually useful to you.

Other actions: `/instagram-sync sync` · `status` · `scheduler` · `refresh` · `recent`.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| PowerShell blocks `Activate.ps1` | Use `.\.venv\Scripts\python.exe` directly. |
| `python` not recognised | Reinstall Python (tick "Add to PATH"). On Mac: `python3`. |
| `Invalid session` | Cookies expired → redo step 2, update `config.json`. |
| 0 new saves | Normal (`state.json` tracks history). Full resync: `python sync.py --reset`. |
| Accented folder names break on Windows | Run `chcp 65001` first (forces UTF-8). |
| ScrapeCreators 401 | Invalid/badly-pasted API key (stray spaces?). |
| Task Scheduler does nothing | **Absolute** paths required (program AND "start in"). |

## Rollout advice

Don't set everything up at once. Do **steps 1–5** (basic sync) first, let it
run for a week, **then** add transcripts, **then** the digest command. A basic
daily sync is already 80% of the system's value.
