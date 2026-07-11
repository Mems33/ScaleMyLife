---
type: index
---

# 🧠 Insta Brain

Your second brain, fed by your Instagram saves. `sync.py` fills
**Instagram Saves/** once a day, `enrich.py` adds reel transcripts, and the
`/instagram-sync digest` slash command extracts the substance into
**Insights/** — summary, key points, concrete actions, tools mentioned.

## Folders

- 📥 **Instagram Saves/** — one note per saved post/reel (written by `sync.py`).
- 💡 **Insights/** — the knowledge extracted from your saves, ready to use.

## To process (status: new)

> Requires the **Dataview** plugin. Without it, open the Instagram Saves
> folder and sort by modification date.

```dataview
TABLE author, ig_type, collection, saved_at
FROM "Instagram Saves"
WHERE status = "new"
SORT saved_at DESC
```

## Reels with a transcript

```dataview
TABLE author, collection
FROM "Instagram Saves"
WHERE ig_type = "Reel" AND transcript = true
SORT saved_at DESC
LIMIT 20
```

## Insights to review

```dataview
TABLE author, topic
FROM "Insights"
WHERE status = "to-review"
SORT created DESC
```

## Search

`Ctrl/Cmd + F` across the vault finds any keyword — including inside the audio
transcripts of your reels. The **graph view** shows connections between
authors, topics and insights.
