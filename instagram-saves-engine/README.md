# Instagram Saves → Obsidian

Transforme tes saves Instagram en second cerveau, en automatique.
Un pipeline Python qui pull tes saves 2×/jour vers ton vault Obsidian, transcrit
les reels, et en extrait les infos exploitables (résumés, points clés, actions,
outils cités) via une slash command Claude Code.

> D'après le guide **« Instagram x Obsidian »** de 0xLoucash. Les scripts que le
> guide te fait générer avec Claude Code sont **déjà écrits ici** — tu n'as qu'à
> configurer et lancer.

## Ce que ça fait

| Fichier | Rôle |
|---|---|
| `sync.py` | Pull tes Instagram saves → écrit un `.md` par post dans ton vault. Dédup via `state.json`. |
| `enrich.py` | Transcrit chaque reel via l'API ScrapeCreators → contenu audio recherchable dans Obsidian. |
| `.claude/commands/instagram-sync.md` | Slash command `/instagram-sync digest` → extrait la substance de tes saves en notes d'insights. |
| `scheduler/…plist` | Auto-sync 2×/jour sur macOS (launchd). Windows via Task Scheduler (voir plus bas). |
| `vault-template/` | La structure de dossiers à copier dans ton vault Obsidian. |

## Sécurité — à lire en premier

- Ton `sessionid` Instagram **= ton mot de passe**. Ne le partage jamais, ne le commit jamais.
- `.gitignore` exclut déjà `config.json`, `state.json`, `sync.log`, `enrich.log`, `.env`, `.venv/`. Ne les commit pas.
- N'utilise ce système que sur **ton propre compte**.

### Risque de ban Instagram — le vrai topo

Ce script utilise l'API web privée d'Instagram avec tes cookies de session —
exactement les mêmes appels que ton navigateur fait quand tu ouvres tes saves.
C'est techniquement contraire aux CGU d'Instagram (automatisation), donc le
risque n'est **jamais zéro**. Mais il est faible si tu respectes le profil
d'usage prévu, parce que le script est **read-only** (il ne like pas, ne
follow pas, ne commente pas, ne poste pas — les comportements qui déclenchent
les bans) et à **très bas volume**.

Ce qui rend l'usage discret par nature :
- 2 syncs/jour max, 1 seconde de pause entre les pages, ~50 posts par page.
- Read-only : aucune action visible côté Instagram.
- Session de ton vrai navigateur, User-Agent desktop classique.

Ce qui peut arriver en pratique (du plus probable au plus rare) :
1. **Session invalidée** — Instagram te déconnecte, le script affiche
   « Invalid session ». Aucune sanction : tu récupères des cookies frais.
2. **Checkpoint « activité suspecte »** — Instagram te demande de confirmer
   ton identité à la prochaine connexion. Ennuyeux, pas une sanction.
3. **Action block temporaire / ban** — quasi inexistant pour du read-only
   perso à ce volume. Les bans visent l'automatisation d'actions (mass-like,
   mass-follow, scraping massif de comptes tiers).

Les règles pour rester dans la zone verte :
- **Lance-le depuis ta machine perso, sur ta connexion habituelle** (pas un
  VPS, pas un VPN qui saute de pays en pays). Une session vue depuis un
  datacenter est le signal le plus louche qui soit.
- **Ne réduis pas les pauses, n'augmente pas la fréquence.** 2×/jour suffit
  largement — tes saves ne bougent pas si vite.
- **Premier run** : c'est le plus gros (il paginera tout ton historique de
  saves). Si tu as 500+ saves, utilise `collections_filter` pour limiter, ou
  lance-le une fois et laisse-le finir tranquillement — après ça, chaque run
  ne touche que le delta.
- **Un seul outil d'automatisation sur le compte.** Si tu utilises déjà un
  autre bot/scheduler tiers, les signaux s'additionnent.
- Ne partage jamais le script configuré (avec ton `config.json`) à quelqu'un
  d'autre, et ne le déploie pas en masse.

**L'alternative 100 % sans risque** : l'export officiel de Meta
(Instagram → Paramètres → Centre de comptes → Tes informations et
autorisations → **Télécharger tes informations** → sélectionne « Contenu
enregistré »). Tu reçois un JSON avec tous tes saves, bannissement impossible
puisque c'est une fonctionnalité officielle. Inconvénients : c'est manuel (pas
d'auto-sync), il faut le redemander à chaque fois, et le délai de préparation
va de quelques minutes à quelques heures. Si le moindre risque t'est
inacceptable, commence par ça — le pipeline (enrich + digest) fonctionne
pareil une fois les notes dans Obsidian.

---

## Setup (30–45 min)

### 1. Architecture — sépare le code du vault

Ce dossier `instagram-saves-engine/` est le **code**. Il doit vivre **hors** de ton
vault Obsidian (p. ex. `~/Code/` ou `C:\Users\TonNom\Code\`).

Copie `vault-template/Mémoire Reels/` **dans ton vault Obsidian**. Tu obtiens :

```
TonVault/
└── Mémoire Reels/
    ├── Instagram Saves/      ← sync.py écrit ici
    ├── Insights/             ← /digest écrit ici
    └── _Index Mémoire Reels.md
```

> Si le dossier code atterrit par accident dans le vault, crée un fichier
> `.obsidianignore` à la racine du vault contenant `instagram-saves-engine/`.

### 2. Récupère tes cookies Instagram (3 min)

1. Chrome → connecte-toi sur **instagram.com**.
2. `F12` (Win) / `Cmd+Option+I` (Mac) → onglet **Application**.
3. Sidebar → **Cookies** → `https://www.instagram.com`.
4. Copie la **Value** de ces 3 cookies :

| Cookie | Contenu |
|---|---|
| `sessionid` | toute la valeur (`78230401234%3AABC...`) |
| `csrftoken` | ~32 caractères |
| `ds_user_id` | un nombre (ton Instagram user ID) |

> ⚠️ Ces cookies expirent toutes les **2 à 4 semaines**. Quand le sync affiche
> « Invalid session », refais juste cette étape.

### 3. Configure `config.json`

```bash
cp config.example.json config.json          # macOS/Linux
Copy-Item config.example.json config.json    # Windows PowerShell
```

Remplis-le avec tes vraies valeurs. **`obsidian_vault_path` doit pointer
EXACTEMENT vers le sous-dossier `Instagram Saves`**, pas le parent :

```json
{
  "ig_session_id": "…",
  "ig_csrftoken": "…",
  "ig_user_id": "…",
  "obsidian_vault_path": "C:/Users/TonNom/Documents/TonVault/Mémoire Reels/Instagram Saves",
  "collections_filter": [],
  "scrapecreators_api_key": "PASTE_YOUR_SCRAPECREATORS_KEY_HERE"
}
```

`collections_filter: []` pull tout. Mets `["Inspiration", "Hooks"]` pour ne
synchroniser que certaines collections Instagram.

### 4. Installe les dépendances

**macOS / Linux :**
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**Windows (PowerShell) :**
```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

> Si PowerShell bloque `Activate.ps1`, pas grave : utilise directement
> `.\.venv\Scripts\python.exe` pour toutes les commandes.

### 5. Premier sync

```bash
python sync.py                       # macOS/Linux
.\.venv\Scripts\python.exe sync.py   # Windows
```

Tu devrais voir :
```
Instagram session valid for @ton_username
Fetching saved posts...
Found 3 collections
Sync complete: 47 new | 0 skipped | 47 total | 0 errors
```

Ouvre Obsidian → `Mémoire Reels/Instagram Saves/` → des `.md` avec `status: new`. 🎉

### 6. Auto-sync 2×/jour

**macOS (launchd) :**
1. Édite `scheduler/com.loucash.instagram-saves-sync.plist` : remplace
   `ABSOLUTE_PROJECT_PATH` par le chemin absolu de ce dossier (`pwd`).
2. Installe :
   ```bash
   cp scheduler/com.loucash.instagram-saves-sync.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.loucash.instagram-saves-sync.plist
   launchctl list | grep instagram-saves   # vérifier
   ```

**Windows (Task Scheduler) :**
- Planificateur de tâches → **Créer une tâche** (pas « tâche de base »).
- **Général** : nom `Instagram Saves Sync`, cocher « Exécuter même si l'utilisateur n'est pas connecté ».
- **Déclencheurs** → Nouveau : Quotidien, 9h00, cocher « Répéter chaque » **12 heures**.
- **Actions** → Nouveau :
  - Programme : `C:\Users\TonNom\Code\instagram-saves-engine\.venv\Scripts\python.exe`
  - Arguments : `sync.py`
  - Démarrer dans : `C:\Users\TonNom\Code\instagram-saves-engine`
- Vérifier : `schtasks /Query /TN "Instagram Saves Sync"`

> Utilise toujours des chemins **absolus** dans le scheduler.

### 7. Bonus — transcripts (ScrapeCreators)

1. Crée un compte sur **scrapecreators.com**, récupère ta clé API (gratuit pour tester).
2. Ajoute-la dans `config.json` → `scrapecreators_api_key`.
3. Lance :
   ```bash
   python enrich.py                       # macOS/Linux
   .\.venv\Scripts\python.exe enrich.py   # Windows
   ```
Chaque reel gagne une section `## Transcript` + `transcript: true` dans le
frontmatter. Tu peux planifier `enrich.py` à 9h05 / 21h05 (5 min après le sync).

### 8. Slash command — extraire les insights

Ouvre Claude Code dans ce dossier, puis :
```
/instagram-sync digest
```
Claude lit tes saves `status: new` (avec transcripts), et écrit pour chacun une
note dans `Insights/` : TL;DR, points clés, actions concrètes, outils/ressources
cités, et un verdict honnête (substance réelle ou engagement-bait). Les
originaux passent en `status: processed`.

> **Personnalise d'abord** le haut de `.claude/commands/instagram-sync.md` :
> tes objectifs et centres d'intérêt. C'est ce qui oriente l'extraction vers ce
> qui t'est réellement utile.

Autres actions : `/instagram-sync sync` · `status` · `scheduler` · `refresh` · `recent`.

---

## Dépannage

| Problème | Fix |
|---|---|
| PowerShell bloque `Activate.ps1` | Utilise `.\.venv\Scripts\python.exe` directement. |
| `python` non reconnu | Réinstalle Python (coche « Add to PATH »). Sur Mac : `python3`. |
| `Invalid session` | Cookies expirés → refais l'étape 2, update `config.json`. |
| 0 nouveaux saves | Normal (`state.json` track l'historique). Pour tout resync : `python sync.py --reset`. |
| Path avec accents (Mémoire, Idées) | Windows : `chcp 65001` avant de lancer (force l'UTF-8). |
| ScrapeCreators 401 | Clé API invalide/mal copiée (espaces ?). |
| Task Scheduler ne lance rien | Chemins **absolus** obligatoires (programme ET « démarrer dans »). |

## Conseil de déploiement

Ne setup pas tout d'un coup. Fais d'abord les **étapes 1–5** (sync basique),
laisse tourner 1 semaine, **puis** ajoute l'enrichment, **puis** la slash command.
Un sync basique 2×/jour = déjà 80 % de la valeur.
