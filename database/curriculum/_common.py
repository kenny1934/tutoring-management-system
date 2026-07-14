"""Shared plumbing for the curriculum pipeline scripts.

Importing this module wires up everything every script needs: the repo
paths, webapp/backend on sys.path (for curriculum.parser/exam_scope), and
the backend .env. Scripts are run directly (python database/curriculum/x.py),
so this directory is already importable as their sys.path[0].
"""
import json
import os
import subprocess
import sys

import pymysql
from dotenv import load_dotenv

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BACKEND_DIR = os.path.join(REPO_ROOT, "webapp", "backend")
PRIV = os.path.join(REPO_ROOT, "private", "curriculum_data")

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

load_dotenv(os.path.join(BACKEND_DIR, ".env"))


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
