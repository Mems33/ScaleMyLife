---
type: dashboard
---

# 🧠 Home

> The one place to start every session. `Ctrl/Cmd+P → "Daily note"` opens today.

## Navigate

- 📥 [[00 - Inbox/Inbox|Inbox]] — process me until empty
- 🎯 [[02 - Projects/Projects|Projects]] — what I'm actively driving
- 🏛️ Areas — [[03 - Areas/Health|Health]] · [[03 - Areas/Mind & Learning|Mind & Learning]] · [[03 - Areas/Work & Study|Work & Study]] · [[03 - Areas/Relationships|Relationships]] · [[03 - Areas/Finances|Finances]] · [[03 - Areas/Creativity|Creativity]]
- 📚 [[04 - Resources/Resources|Resources]] — reference & source notes
- 🕸️ [[05 - Zettelkasten/Zettelkasten - How to write permanent notes|Zettelkasten]] — my permanent ideas
- ⚙️ [[90 - Meta/How this vault works|How this vault works]] · [[90 - Meta/Workflows|Workflows]] · [[90 - Meta/Plugins|Plugins]] · [[90 - Meta/ScaleMyLife + Second Brain|ScaleMyLife integration]]

## Open loops

*Requires the Dataview plugin — until then, this section is a reminder to check your projects by hand.*

```dataview
TASK
FROM "02 - Projects"
WHERE !completed
LIMIT 15
```

## Active projects

```dataview
TABLE status, deadline, area
FROM "02 - Projects"
WHERE type = "project" AND status != "done"
SORT deadline ASC
```

## Recently touched

```dataview
LIST
FROM ""
WHERE file.name != "Home"
SORT file.mtime DESC
LIMIT 8
```
