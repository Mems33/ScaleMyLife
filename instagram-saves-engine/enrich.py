#!/usr/bin/env python3
"""enrich.py — Add reel transcripts to your Instagram-save notes.

Part of the "Instagram Saves -> Obsidian" system (guide by 0xLoucash).

Scans the Markdown notes written by sync.py, and for every *reel* that hasn't
been enriched yet, asks the ScrapeCreators API for the audio transcript and
appends it to the note. That makes the spoken content of your reels fully
searchable inside Obsidian (Ctrl+F on any keyword).

Reads config.json (same file as sync.py) for:
    - scrapecreators_api_key
    - obsidian_vault_path
"""
from __future__ import annotations

import json
import logging
import re
import sys
import time
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
CONFIG_PATH = HERE / "config.json"
LOG_PATH = HERE / "enrich.log"

TRANSCRIPT_ENDPOINT = "https://api.scrapecreators.com/v2/instagram/media/transcript"
CALL_SLEEP = 2.0        # be polite between API calls
MAX_RETRIES = 5

log = logging.getLogger("enrich")


class ApiKeyError(Exception):
    """Raised when ScrapeCreators rejects the API key."""


# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #
def load_config() -> dict:
    if not CONFIG_PATH.exists():
        sys.exit("config.json not found — run sync.py setup first (README step 4).")
    with CONFIG_PATH.open(encoding="utf-8") as fh:
        config = json.load(fh)
    key = config.get("scrapecreators_api_key")
    if not key or str(key).startswith("PASTE_"):
        sys.exit(
            "config.json is missing 'scrapecreators_api_key'. Add your key from "
            "scrapecreators.com (README step 7)."
        )
    if not config.get("obsidian_vault_path"):
        sys.exit("config.json is missing 'obsidian_vault_path'.")
    return config


# --------------------------------------------------------------------------- #
# Frontmatter helpers (targeted parser — only reads notes we generate)
# --------------------------------------------------------------------------- #
def split_frontmatter(text: str) -> "tuple[str, str]":
    match = re.match(r"^---\n(.*?)\n---\n?(.*)$", text, re.DOTALL)
    if match:
        return match.group(1), match.group(2)
    return "", text


def parse_scalars(frontmatter: str) -> dict:
    data: dict[str, str] = {}
    for line in frontmatter.splitlines():
        field = re.match(r"^([A-Za-z0-9_]+):\s?(.*)$", line)
        if field:
            data[field.group(1)] = field.group(2).strip().strip('"')
    return data


def set_field(frontmatter: str, key: str, value: str) -> str:
    lines = frontmatter.splitlines()
    out, found = [], False
    for line in lines:
        if re.match(rf"^{re.escape(key)}:(\s|$)", line):
            out.append(f"{key}: {value}")
            found = True
        else:
            out.append(line)
    if not found:
        out.append(f"{key}: {value}")
    return "\n".join(out)


# --------------------------------------------------------------------------- #
# ScrapeCreators API
# --------------------------------------------------------------------------- #
def extract_transcript(payload: dict) -> str:
    """Pull the transcript text out of the API response, whatever its shape."""
    if not isinstance(payload, dict):
        return ""
    if isinstance(payload.get("transcript"), str):
        return payload["transcript"].strip()
    if isinstance(payload.get("text"), str):
        return payload["text"].strip()
    transcripts = payload.get("transcripts")
    if isinstance(transcripts, list):
        parts = [
            t.get("text", "") if isinstance(t, dict) else str(t)
            for t in transcripts
        ]
        return "\n".join(p for p in parts if p).strip()
    return ""


def fetch_transcript(url: str, api_key: str) -> "str | None":
    delay = CALL_SLEEP
    for attempt in range(1, MAX_RETRIES + 1):
        resp = requests.get(
            TRANSCRIPT_ENDPOINT,
            params={"url": url},
            headers={"x-api-key": api_key},
            timeout=60,
        )
        if resp.status_code == 401:
            raise ApiKeyError()
        if resp.status_code == 429:
            log.warning("Rate limited (429) — backing off %.0fs (try %d/%d)",
                        delay, attempt, MAX_RETRIES)
            time.sleep(delay)
            delay *= 2
            continue
        resp.raise_for_status()
        try:
            payload = resp.json()
        except ValueError:
            return None
        return extract_transcript(payload) or None
    log.warning("Gave up on %s after %d rate-limited attempts.", url, MAX_RETRIES)
    return None


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
    setup_logging()
    config = load_config()
    api_key = config["scrapecreators_api_key"]
    vault = Path(config["obsidian_vault_path"]).expanduser()
    if not vault.exists():
        sys.exit(f"Vault folder not found: {vault}")

    enriched = skipped = already_done = errors = 0

    for path in sorted(vault.glob("*.md")):
        try:
            text = path.read_text(encoding="utf-8")
            frontmatter, body = split_frontmatter(text)
            if not frontmatter:
                skipped += 1
                continue
            data = parse_scalars(frontmatter)

            if data.get("transcript") in ("true", "false"):
                already_done += 1
                continue
            if data.get("ig_type") != "Reel":
                skipped += 1
                continue

            url = data.get("url")
            if not url:
                skipped += 1
                continue

            log.info("Transcribing %s", path.name)
            transcript = fetch_transcript(url, api_key)

            if transcript:
                new_fm = set_field(frontmatter, "transcript", "true")
                new_body = (
                    body.rstrip()
                    + "\n\n## Transcript\n\n"
                    + transcript
                    + "\n"
                )
                enriched += 1
            else:
                new_fm = set_field(frontmatter, "transcript", "false")
                new_body = body
                log.info("  no speech detected")

            path.write_text(f"---\n{new_fm}\n---\n{new_body}", encoding="utf-8")
            time.sleep(CALL_SLEEP)

        except ApiKeyError:
            log.error("Invalid ScrapeCreators API key (401). Check config.json.")
            return 1
        except Exception:  # noqa: BLE001 — per-file resilience
            errors += 1
            log.exception("Failed on %s — continuing.", path.name)
            continue

    log.info(
        "Enrich complete: %d enriched | %d skipped | %d already done | %d errors",
        enriched,
        skipped,
        already_done,
        errors,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
