---
type: index
---

# 🧠 Mémoire Reels

Ton second cerveau alimenté par tes saves Instagram. `sync.py` remplit
**Instagram Saves/** deux fois par jour, `enrich.py` y ajoute les transcripts
des reels, et la slash command `/instagram-sync digest` en extrait la substance
dans **Insights/** — résumé, points clés, actions concrètes, outils cités.

## Dossiers

- 📥 **Instagram Saves/** — une note par post/reel saved (écrit par `sync.py`).
- 💡 **Insights/** — les connaissances extraites de tes saves, prêtes à exploiter.

## À traiter (status: new)

> Nécessite le plugin **Dataview**. Sans lui, ouvre le dossier Instagram Saves
> et trie par date de modification.

```dataview
TABLE author, ig_type, collection, saved_at
FROM "Mémoire Reels/Instagram Saves"
WHERE status = "new"
SORT saved_at DESC
```

## Reels avec transcript

```dataview
TABLE author, collection
FROM "Mémoire Reels/Instagram Saves"
WHERE ig_type = "Reel" AND transcript = true
SORT saved_at DESC
LIMIT 20
```

## Insights à revoir

```dataview
TABLE author, topic
FROM "Mémoire Reels/Insights"
WHERE status = "to-review"
SORT created DESC
```

## Recherche

`Ctrl/Cmd + F` dans ce dossier pour retrouver n'importe quel mot-clé — y compris
dans les transcripts audio des reels. Le **graph view** montre les connexions
entre auteurs, sujets et insights.
