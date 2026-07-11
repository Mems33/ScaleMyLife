---
type: meta
---

# 🔌 Plugins & setup

The vault works with **zero plugins** — capture, links, templates and daily notes are Obsidian core. These community plugins remove the manual work. Install via *Settings → Community plugins → Browse* (you'll need to turn off Restricted mode).

## Install these (in order of payoff)

1. **Dataview** — makes [[Home]] live: open tasks, active projects and recent notes query themselves. Without it those blocks show as code.
2. **Tasks** — checkboxes get due dates, recurrence, and vault-wide queries ("everything overdue").
3. **Templater** — smarter templates than core: auto-insert on new daily notes, dynamic dates (yesterday/tomorrow links), file-move automation. The bundled templates use core `{{date}}`/`{{title}}` syntax, so they work either way.
4. **Calendar** — a sidebar month view; click a day to open/create its daily note. Cheap and delightful.
5. **Periodic Notes** — adds weekly/monthly notes as first-class citizens (pairs with the Weekly/Monthly Review templates).

**Worth a look later:** Omnisearch (better search), Excalidraw (sketches/diagrams), QuickAdd (one-hotkey capture macros), Obsidian Git (if you sync via git).

## Sync between devices — pick one

| Option | Cost | Notes |
|---|---|---|
| **Obsidian Sync** | paid | Official, end-to-end encrypted, zero fuss, works on mobile. Best if you just want it to work. |
| **iCloud Drive** | free | Easiest on Apple-only setups: keep the vault in iCloud, open it on iPhone/iPad. |
| **Syncthing** | free | Peer-to-peer, private, all platforms; slightly technical setup. |
| **Git** (e.g. this repo) | free | Full history for free; use the Obsidian Git plugin to auto-commit. Awkward on phones — fine as a desktop-first choice. |

⚠️ Whatever you pick, **don't mix two sync methods** on the same vault — that's the classic conflict factory.

## Settings already configured for you

- New notes → `00 - Inbox` (capture goes to the right place automatically)
- Attachments → `99 - Attachments`
- Daily notes → `01 - Daily`, `YYYY-MM-DD`, using the Daily Note template
- Templates folder → `07 - Templates`
