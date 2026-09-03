"""Shared plumbing for the curriculum pipeline scripts.

Importing this module wires up everything every script needs: the repo
paths, webapp/backend on sys.path (for curriculum.parser/exam_scope), and
the backend .env. Scripts are run directly (python database/curriculum/x.py),
so this directory is already importable as their sys.path[0].
"""
import json
import os
import re
import subprocess
import sys
import unicodedata

import pymysql
from dotenv import load_dotenv

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BACKEND_DIR = os.path.join(REPO_ROOT, "webapp", "backend")
PRIV = os.path.join(REPO_ROOT, "private", "curriculum_data")

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

load_dotenv(os.path.join(BACKEND_DIR, ".env"))


# --- school names ------------------------------------------------------------
# Folder names, sheet rows and calendar events all spell schools slightly
# differently (DBWY for DBYW, 青州 for 青洲, a stream suffix present or not).
# school_aliases.json holds the canonical list plus a FIX table of known
# misspellings; canon_school turns any spelling into canonical names.

_school_data = None


def _school_aliases():
    global _school_data
    if _school_data is None:
        with open(os.path.join(PRIV, "school_aliases.json"), encoding="utf-8") as fh:
            data = json.load(fh)
        _school_data = (set(data["CANON"]), data["FIX"])
    return _school_data


def norm(s):
    return unicodedata.normalize("NFKC", s or "").strip()


def canon_school(name, stream=None):
    """Return the list of canonical school names a label stands for.

    A label can name several schools (shared prep folders like "PCMS, KPS"),
    so the result is a list. Unknown names come back as an empty list and the
    caller counts them, so a new school shows up as a number in the run's
    stats rather than silently vanishing.
    """
    canon_set, fix = _school_aliases()
    name = norm(name)
    if name in ("新增資料夾", "") or name.endswith(".pdf"):
        return []
    parts = (re.split(r"[,，]\s*|\s{1,}(?=[A-Z一-鿿])", name)
             if (" " in name or "," in name or "，" in name) else [name])
    out = []
    for p in parts:
        p = fix.get(p.strip(), p.strip())
        if not p:
            continue
        if p in canon_set:
            out.append(p)
        elif stream and f"{p}-{stream}" in canon_set:
            out.append(f"{p}-{stream}")
    return out


def connect():
    return pymysql.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        charset="utf8mb4",
        connect_timeout=10,
    )


def resolve(cur, ref):
    """Resolve a seed reference to exactly one concept id.

    Coded ref: ["SPACE", "code"] via concept_code_aliases (must be unambiguous —
    MAS and HK_NEW codes each alias exactly one concept, unlike HK_OLD splits).
    Name ref: {"name_en": ...} for extension concepts, which carry no codes.
    """
    if isinstance(ref, list):
        space, code = ref
        cur.execute(
            "SELECT DISTINCT concept_id FROM concept_code_aliases "
            "WHERE code_space = %s AND code = %s",
            (space, code),
        )
        rows = cur.fetchall()
        label = f"{space} {code}"
    else:
        cur.execute(
            "SELECT id FROM curriculum_concepts WHERE name_en = %s",
            (ref["name_en"],),
        )
        rows = cur.fetchall()
        label = ref["name_en"]
    if len(rows) != 1:
        sys.exit(f"Reference {label!r} resolved to {len(rows)} concepts — "
                 f"seed requires exactly one. Aborting (nothing written).")
    return rows[0][0]


def gemini_client():
    from google import genai
    from google.oauth2.credentials import Credentials

    # Local ADC may be stale; the gcloud user credential is the reliable one here.
    token = subprocess.check_output(
        ["gcloud", "auth", "print-access-token"], text=True
    ).strip()
    return genai.Client(
        vertexai=True,
        project=os.getenv("GOOGLE_CLOUD_PROJECT", "csm-database-project"),
        location="global",
        credentials=Credentials(token=token),
    )


def parse_json_array(text):
    """The model sometimes appends stray text after the array — take the
    first complete JSON value instead of requiring a clean document."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        value, _ = json.JSONDecoder().raw_decode(text[text.index("["):])
        return value
