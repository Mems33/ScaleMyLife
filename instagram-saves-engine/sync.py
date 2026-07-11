#!/usr/bin/env python3
"""sync.py — Pull Instagram saved posts into an Obsidian vault as Markdown.

Part of the "Instagram Saves -> Obsidian" system (guide by 0xLoucash).

It talks to Instagram's private *web* API the same way a desktop browser does
(using the session cookies you paste into config.json), fetches your saved
posts, and writes one Markdown note per *new* save into your Obsidian vault.
Already-synced posts are remembered in state.json, so every run only writes
what's new. Designed to be run twice a day by a scheduler (see the README).

Usage:
    python sync.py            # normal run
    python sync.py --reset    # forget history (re-sync everything next run)
"""
from __future__ import annotations

import argparse
import json
import logging
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
CONFIG_PATH = HERE / "config.json"
STATE_PATH = HERE / "state.json"
LOG_PATH = HERE / "sync.log"

# Mimic the Instagram web client, not the mobile app.
IG_APP_ID = "936619743392459"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)
BASE = "https://www.instagram.com"
PAGE_SLEEP = 1.0          # be polite: 1s between pages
CAPTION_LIMIT = 2000      # truncate long captions in the body

log = logging.getLogger("sync")


class SessionExpired(Exception):
    """Raised when Instagram no longer accepts the saved cookies."""


# --------------------------------------------------------------------------- #
# Config & state
# --------------------------------------------------------------------------- #
def load_config() -> dict:
    if not CONFIG_PATH.exists():
        sys.exit(
            "config.json not found. Copy config.example.json to config.json "
            "and fill in your Instagram cookies (see the README, step 4)."
        )
    with CONFIG_PATH.open(encoding="utf-8") as fh:
        config = json.load(fh)
    for key in ("ig_session_id", "ig_csrftoken", "ig_user_id", "obsidian_vault_path"):
        if not config.get(key) or str(config[key]).startswith("PASTE_"):
            sys.exit(f"config.json is missing a real value for '{key}'.")
    return config


def load_state() -> dict:
    if STATE_PATH.exists():
        try:
            with STATE_PATH.open(encoding="utf-8") as fh:
                data = json.load(fh)
            data.setdefault("synced_ids", [])
            return data
        except (json.JSONDecodeError, OSError):
            log.warning("state.json unreadable — starting from an empty history.")
    return {"synced_ids": []}


def save_state(state: dict) -> None:
    with STATE_PATH.open("w", encoding="utf-8") as fh:
        json.dump(state, fh, indent=2, ensure_ascii=False)


# --------------------------------------------------------------------------- #
# Instagram web API
# --------------------------------------------------------------------------- #
def build_session(config: dict) -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": USER_AGENT,
            "X-IG-App-ID": IG_APP_ID,
            "X-CSRFToken": config["ig_csrftoken"],
            "X-Requested-With": "XMLHttpRequest",
            "Referer": f"{BASE}/",
            "Accept": "*/*",
        }
    )
    for name, value in (
        ("sessionid", config["ig_session_id"]),
        ("csrftoken", config["ig_csrftoken"]),
        ("ds_user_id", config["ig_user_id"]),
    ):
        session.cookies.set(name, value, domain=".instagram.com")
    return session


def validate_session(session: requests.Session) -> str:
    """Confirm the cookies still work; return the logged-in username."""
    resp = session.get(f"{BASE}/api/v1/accounts/edit/web_form_data/", timeout=30)
    if resp.status_code in (401, 403) or "/accounts/login" in resp.url:
        raise SessionExpired()
    try:
        username = resp.json()["form_data"]["username"]
    except (ValueError, KeyError):
        raise SessionExpired()
    return username


def fetch_collections(session: requests.Session) -> dict[str, str]:
    """Return {collection_id: collection_name} for the account's saved collections."""
    try:
        resp = session.get(f"{BASE}/api/v1/collections/list/", timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError) as exc:
        log.warning("Could not fetch collection list (%s) — continuing without it.", exc)
        return {}
    collections: dict[str, str] = {}
    for item in data.get("items", []):
        cid = item.get("collection_id") or item.get("id")
        name = item.get("collection_name") or item.get("name")
        if cid and name:
            collections[str(cid)] = name
    return collections


def paginate(session: requests.Session, url: str) -> "list[dict]":
    """Yield media dicts from a saved/collection feed, following pagination."""
    params = {"count": 50}
    while True:
        resp = session.get(url, params=params, timeout=30)
        if resp.status_code in (401, 403):
            raise SessionExpired()
        resp.raise_for_status()
        data = resp.json()
        for entry in data.get("items", []):
            media = entry.get("media") or entry
            if media:
                yield media
        if not data.get("more_available"):
            break
        next_max_id = data.get("next_max_id")
        if not next_max_id:
            break
        params["max_id"] = next_max_id
        time.sleep(PAGE_SLEEP)


# --------------------------------------------------------------------------- #
# Media parsing & Markdown rendering
# --------------------------------------------------------------------------- #
def parse_media(media: dict, collection_name: str) -> dict:
    pk = str(media.get("pk") or media.get("id") or "").split("_")[0]
    code = media.get("code") or ""
    user = (media.get("user") or {}).get("username") or "unknown"
    caption_obj = media.get("caption")
    caption = (caption_obj or {}).get("text", "") if caption_obj else ""
    product_type = media.get("product_type") or ""
    media_type = media.get("media_type")

    if product_type == "clips":
        ig_type = "Reel"
    elif media_type == 8 or product_type == "carousel_container":
        ig_type = "Carousel"
    else:
        ig_type = "Post"

    taken_at = media.get("taken_at")
    when = (
        datetime.fromtimestamp(taken_at, tz=timezone.utc)
        if taken_at
        else datetime.now(tz=timezone.utc)
    )

    if ig_type == "Reel":
        url = f"https://instagram.com/reel/{code}/"
    else:
        url = f"https://instagram.com/p/{code}/"

    return {
        "pk": pk,
        "shortcode": code,
        "author": user,
        "caption": caption,
        "ig_type": ig_type,
        "url": url,
        "date": when,
        "collection": collection_name,
    }


def _yaml(value: str) -> str:
    """Quote a scalar safely for YAML frontmatter."""
    escaped = str(value).replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", str(value).lower()).strip("-")
    return slug or "untagged"


def render_markdown(fields: dict) -> str:
    caption = fields["caption"] or ""
    truncated = caption[:CAPTION_LIMIT]
    if len(caption) > CAPTION_LIMIT:
        truncated += "…"

    tags = ["instagram", fields["ig_type"].lower(), _slug(fields["collection"])]
    saved_at = datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat()

    frontmatter = "\n".join(
        [
            "---",
            "type: instagram-save",
            f"author: {_yaml(fields['author'])}",
            f"url: {_yaml(fields['url'])}",
            f"ig_type: {fields['ig_type']}",
            "status: new",
            f"saved_at: {saved_at}",
            f"date: {fields['date']:%Y-%m-%d}",
            f"collection: {_yaml(fields['collection'])}",
            f"media_id: {_yaml(fields['pk'])}",
            f"shortcode: {_yaml(fields['shortcode'])}",
            f"tags: [{', '.join(tags)}]",
            "---",
        ]
    )

    body = "\n".join(
        [
            "",
            f"# {fields['author']} — {fields['ig_type']}",
            "",
            f"**Auteur :** [@{fields['author']}](https://instagram.com/{fields['author']}/)",
            f"**Collection :** {fields['collection']}",
            f"**Lien :** {fields['url']}",
            "",
            "## Caption",
            "",
            truncated if truncated else "_(pas de caption)_",
            "",
        ]
    )
    return frontmatter + "\n" + body


def note_path(vault: Path, fields: dict) -> Path:
    shortcode = re.sub(r"[^A-Za-z0-9_-]", "", fields["shortcode"]) or fields["pk"]
    return vault / f"{fields['date']:%Y-%m-%d}-{shortcode}.md"


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def setup_logging() -> None:
    log.setLevel(logging.INFO)
    file_handler = logging.FileHandler(LOG_PATH, encoding="utf-8")
    file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(logging.Formatter("%(message)s"))
    log.handlers.clear()
    log.addHandler(file_handler)
    log.addHandler(console)


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync Instagram saves to Obsidian.")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Clear state.json so every saved post is re-synced on the next run.",
    )
    args = parser.parse_args()

    setup_logging()

    if args.reset:
        save_state({"synced_ids": []})
        log.info("state.json reset — next run will re-sync everything.")
        return 0

    config = load_config()
    vault = Path(config["obsidian_vault_path"]).expanduser()
    vault.mkdir(parents=True, exist_ok=True)

    state = load_state()
    synced: set[str] = set(state.get("synced_ids", []))

    session = build_session(config)
    try:
        username = validate_session(session)
    except SessionExpired:
        log.error(
            "Invalid session — your Instagram cookies have expired. "
            "Refresh them (README step 2) and update config.json."
        )
        return 1

    log.info("Instagram session valid for @%s", username)
    log.info("Fetching saved posts...")

    collections = fetch_collections(session)
    if collections:
        log.info("Found %d collections", len(collections))

    filter_names = [n for n in (config.get("collections_filter") or []) if n]
    sources: list[tuple[str, str]] = []  # (collection_name, feed_url)
    if filter_names:
        by_name = {name.lower(): cid for cid, name in collections.items()}
        for name in filter_names:
            cid = by_name.get(name.lower())
            if not cid:
                log.warning("Unknown collection '%s' — skipping.", name)
                continue
            sources.append((name, f"{BASE}/api/v1/feed/collection/{cid}/posts/"))
        if not sources:
            log.error("None of the collections in collections_filter were found.")
            return 1
    else:
        sources.append(("All Saves", f"{BASE}/api/v1/feed/saved/posts/"))

    new_count = skipped = errors = 0
    try:
        for coll_name, url in sources:
            for media in paginate(session, url):
                try:
                    fields = parse_media(media, coll_name)
                    pk = fields["pk"]
                    if not pk or pk in synced:
                        skipped += 1
                        continue
                    path = note_path(vault, fields)
                    if path.exists():
                        # Don't clobber a note you may have edited; just remember it.
                        synced.add(pk)
                        skipped += 1
                        continue
                    path.write_text(render_markdown(fields), encoding="utf-8")
                    synced.add(pk)          # only after a successful write
                    new_count += 1
                    log.info("  + %s (%s)", path.name, coll_name)
                except Exception:            # noqa: BLE001 — per-post resilience
                    errors += 1
                    log.exception("Failed to process one post — continuing.")
                    continue
            # Persist after each source so a crash never loses progress.
            state["synced_ids"] = sorted(synced)
            save_state(state)
    except SessionExpired:
        state["synced_ids"] = sorted(synced)
        save_state(state)
        log.error("Session expired mid-run — refresh cookies and re-run. Progress saved.")
        return 1

    state["synced_ids"] = sorted(synced)
    save_state(state)

    total = new_count + skipped
    log.info(
        "Sync complete: %d new | %d skipped | %d total | %d errors",
        new_count,
        skipped,
        total,
        errors,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
