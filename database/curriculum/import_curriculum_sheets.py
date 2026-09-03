"""Import the School Curriculum Google Sheets into School Progress.

Each school year the centre keeps a Google Sheet called "School Curriculum
YYYY-YYYY" where tutors record what topic each school's classes are on
each week. It has one tab per grade and language stream (F1C, F1E, ...),
schools down column A, the school's textbook in column B, and one column
per school week from column C, week 1 being the week of 1 September.

Until now those sheets reached the pipeline as a one-off export: the
2024-25 and 2025-26 sheets were parsed in July 2026 and frozen into
dryrun/sheet_classified.json. This script reads the live sheet through the
Sheets API instead, so the nightly re-scan (rescan_weekly_folders.py) picks
up what tutors typed during the week.

For every filled cell it splits the text into topic parts and resolves each
part to a curriculum concept with the same parser the exam-scope feature
uses (curriculum/exam_scope.py). The school's series (人教 order or Hong
Kong order) comes from the textbook column when it names the book, and
otherwise from the school's existing observations, so a chapter name that
exists in both series resolves to the right one. A part the parser cannot
place is looked up in two places before it counts as unmatched: the
reviewed answers of this pipeline's own AI pass (ai_map_sheet_strings.py),
and the July residual maps, because tutors phrase the same topics the same
way year after year. What is still unmatched is written out for the AI
pass to pick up.

Output, one file per year: private/curriculum_data/sheets/sheet_<year>.json,
which backfill_observations.py reads as its live sheet channel. Nothing
here writes to the database.

Usage (from the repo root, with the backend venv):
    webapp/backend/venv/bin/python database/curriculum/import_curriculum_sheets.py
        [--year 2026-2027]        only this year (default: every year in
                                  curriculum_sheets.json)
        [--spreadsheet-id ID]     read this sheet for --year instead of the
                                  configured one (for checking an old year)
        [--dry-run]               parse and report, write nothing
        [--show-unmatched N]      print the N most frequent unmatched strings

Which sheet belongs to which year lives in curriculum_sheets.json next to
this script. Each sheet must be shared (viewer) with the service account
whose key sits in the backend .env as GOOGLE_SA_KEY_B64.
"""
import argparse
import base64
import datetime as dt
import glob
import json
import os
import re
import sys
from collections import Counter, defaultdict

from _common import PRIV, canon_school, connect  # noqa: E402  (sets sys.path + .env)
from curriculum.exam_scope import ScopeMatcher, normalize  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG = os.path.join(HERE, "curriculum_sheets.json")
SHEETS_DIR = os.path.join(PRIV, "sheets")
AI_MAPPINGS = os.path.join(SHEETS_DIR, "ai_sheet_mappings.json")
GRADES = ("F1", "F2", "F3")
TAB_RE = re.compile(r"^\s*(F[1-6])\s*([CE])\s*$")
WEEK_HEADER_RE = re.compile(r"(?i)week\s*(\d{1,2})")
# Textbook column: the 人教 book (or its formal title 義務教育教科書) pins the
# MAS series; the usual Hong Kong junior titles pin HK. Anything else falls
# back to what the school's observations say.
MAS_BOOK_RE = re.compile(r"人教|義務教育")
HK_BOOK_RE = re.compile(r"(?i)junior sec|in action|new century|longman|oxford|pearson")
# A part tagged as a revision, test or exam week still names the topic being
# revised; it is recorded, but flagged so the timeline views leave it out.
REVISION_KINDS = {"revision", "exam", "test"}
# AI answers never outrank a mechanical exact-name match.
AI_CONF_CAP = 0.85
# A sheet entry for an F1 class that resolves only to an F3 chapter is a
# mis-read (an F1 "角平分線" is the angle bisector in the F1 geometry chapter,
# not the F2 congruence property). Measured on the 2025-26 sheet against the
# July classification: two grades above the tab was wrong two times in
# three, one grade above was right nine times in ten (schools do teach
# ahead). So only the two-grade jumps are held back for the AI pass, which
# sees the school's other entries and can still confirm them.
MAX_GRADE_AHEAD = 1
GRADE_ORDER = {"F1": 1, "F2": 2, "F3": 3, "F4": 4, "F5": 5, "F6": 6}
# The July residual maps grade their confidence in words.
JULY_CONF = {"high": 0.9, "med": 0.7, "medium": 0.7, "low": 0.5}


def ai_key(school, grade, part):
    return f"{school}|{grade}|{normalize(part)}"


# --- Google Sheets -----------------------------------------------------------

def sheets_service():
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    key = os.environ.get("GOOGLE_SA_KEY_B64")
    if not key:
        sys.exit("GOOGLE_SA_KEY_B64 is not set in webapp/backend/.env, so there is "
                 "no service account to read the sheets with.")
    info = json.loads(base64.b64decode(key))
    creds = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"]
    )
    return build("sheets", "v4", credentials=creds, cache_discovery=False), info.get("client_email")


def fetch_tabs(svc, spreadsheet_id):
    """-> (title, {tab name: rows}) for the F1 to F3 tabs."""
    meta = svc.spreadsheets().get(
        spreadsheetId=spreadsheet_id, fields="properties.title,sheets.properties.title"
    ).execute()
    wanted = []
    for s in meta["sheets"]:
        title = s["properties"]["title"]
        m = TAB_RE.match(title)
        if m and m.group(1) in GRADES:
            wanted.append(title)
    if not wanted:
        return meta["properties"]["title"], {}
    resp = svc.spreadsheets().values().batchGet(
        spreadsheetId=spreadsheet_id,
        ranges=[f"'{t}'!A1:BA400" for t in wanted],
    ).execute()
    tabs = {t: vr.get("values", []) for t, vr in zip(wanted, resp.get("valueRanges", []))}
    return meta["properties"]["title"], tabs


def parse_tab(tab, values):
    """Yield (grade, stream, school label, textbook, [(week, text)]) per school row.

    Week numbers come from the "Week N" header row so an extra or missing
    column cannot shift every week by one; the template position is only the
    fallback for a tab with no header.
    """
    grade, stream = TAB_RE.match(tab).groups()
    header = values[1] if len(values) > 1 else []
    week_of_col = {}
    for ci, cell in enumerate(header):
        m = WEEK_HEADER_RE.search(str(cell))
        if m:
            week_of_col[ci] = int(m.group(1))
    if not week_of_col:
        week_of_col = {ci: ci - 1 for ci in range(2, 60)}
    for row in values[2:]:
        label = str(row[0]).strip() if row else ""
        if not label:
            continue
        textbook = str(row[1]).strip() if len(row) > 1 else ""
        cells = [(week_of_col[ci], str(v)) for ci, v in enumerate(row)
                 if ci in week_of_col and str(v).strip()]
        yield grade, stream, label, textbook, cells


# --- vocabulary and lookups --------------------------------------------------

def load_vocab(cur):
    cur.execute("""
        SELECT id, name_en, name_zh, kind, COALESCE(grade, atlas_grade)
        FROM curriculum_concepts
    """)
    concepts = cur.fetchall()
    cur.execute("SELECT concept_id, code_space, code FROM concept_code_aliases")
    aliases = cur.fetchall()
    alias_map = defaultdict(list)
    for cid, space, code in aliases:
        alias_map[(space, str(code))].append(cid)
    return ScopeMatcher(concepts, aliases), alias_map


def school_series_map(cur):
    """school -> "MAS"/"HK" by the weight of its existing observations.

    Aliases are deduplicated per (concept, side) first: most HK concepts
    carry both an HK_NEW and an HK_OLD row, and a bare join would double
    their weight against MAS.
    """
    cur.execute("""
        SELECT o.school, a.s, SUM(o.confidence)
        FROM school_topic_observations o
        JOIN (
            SELECT DISTINCT concept_id,
                   CASE WHEN code_space = 'MAS' THEN 'MAS' ELSE 'HK' END AS s
            FROM concept_code_aliases
        ) a ON a.concept_id = o.concept_id
        GROUP BY o.school, a.s
    """)
    weights = defaultdict(dict)
    for school, series, w in cur.fetchall():
        weights[school][series] = float(w or 0)
    return {school: max(d, key=d.get) for school, d in weights.items()}


def series_for(textbook, school, series_of):
    if MAS_BOOK_RE.search(textbook or ""):
        return "MAS"
    if HK_BOOK_RE.search(textbook or ""):
        return "HK"
    return series_of.get(school)


def load_ai_mappings():
    if not os.path.exists(AI_MAPPINGS):
        return {}
    with open(AI_MAPPINGS, encoding="utf-8") as fh:
        return json.load(fh)


def load_july_residuals():
    """The AI answers from the July import, keyed by the string as written."""
    out = {}
    for path in sorted(glob.glob(os.path.join(PRIV, "dryrun", "residual_mapped*.json"))):
        with open(path, encoding="utf-8") as fh:
            for e in json.load(fh):
                out.setdefault(e["s"], e)
                out.setdefault(normalize(e["s"]), e)
    return out


def july_concepts(entry, series, alias_map):
    """(concepts, kind) from a July residual entry, series-aware like the
    frozen sheet channel: the school's own series first, then whichever
    code the entry carries."""
    if entry.get("type") != "topic":
        return [], "nontopic"
    codes = {"MAS": entry.get("mas"), "HK": entry.get("hk")}
    order = ([series] if series in codes else []) + [s for s in ("MAS", "HK") if s != series]
    for s in order:
        code = codes.get(s)
        if not code:
            continue
        code = str(code)
        cids = (alias_map.get(("MAS", code)) if s == "MAS"
                else alias_map.get(("HK_NEW", code)) or alias_map.get(("HK_OLD", code)))
        if cids:
            conf = JULY_CONF.get(str(entry.get("conf")).lower(), 0.5)
            return [{"concept_id": c, "confidence": conf, "channel": "ai"} for c in cids], "topic"
    return [], "topic"


# --- one year ----------------------------------------------------------------

def import_year(year, spreadsheet_id, matcher, alias_map, series_of, ai_map, july, args):
    from googleapiclient.errors import HttpError

    svc, sa_email = sheets_service()
    try:
        title, tabs = fetch_tabs(svc, spreadsheet_id)
    except HttpError as e:
        if e.resp.status in (403, 404):
            print(f"  cannot open the {year} sheet ({e.resp.status}): share it with "
                  f"{sa_email} as a viewer and check the id in curriculum_sheets.json.")
            return False
        raise

    stats = Counter()
    rows, unmatched = [], {}
    unknown = Counter()
    per_tab = Counter()
    weeks_seen = set()

    for tab, values in tabs.items():
        for grade, stream, label, textbook, cells in parse_tab(tab, values):
            schools = canon_school(label, stream)
            if not schools:
                unknown[label] += len(cells)
                continue
            for school in schools:
                series = series_for(textbook, school, series_of)
                for week, text in cells:
                    stats["cells"] += 1
                    per_tab[tab] += 1
                    weeks_seen.add(week)
                    for line in matcher.parse(text, series=series, grade=grade):
                        stats["parts"] += 1
                        kind, concepts, via = line["kind"], line["concepts"], "parser"
                        if concepts and all(
                            GRADE_ORDER.get(matcher.grade_of.get(c["concept_id"]), 0)
                            - GRADE_ORDER[grade] > MAX_GRADE_AHEAD
                            for c in concepts
                        ):
                            stats["held_back:above_grade"] += 1
                            concepts = []
                        if not concepts:
                            key = ai_key(school, grade, line["text"])
                            answer = ai_map.get(key)
                            if answer is not None:
                                via = "ai"
                                concepts = [
                                    {"concept_id": t["concept_id"],
                                     "confidence": min(float(t["conf"]), AI_CONF_CAP),
                                     "channel": "ai"}
                                    for t in answer.get("topics", [])
                                ]
                                if not concepts:
                                    stats["reviewed_nontopic"] += 1
                                    continue
                            else:
                                entry = july.get(line["text"].strip()) or july.get(normalize(line["text"]))
                                if entry is not None:
                                    concepts, jkind = july_concepts(entry, series, alias_map)
                                    via = "july"
                                    if jkind == "nontopic":
                                        stats["reviewed_nontopic"] += 1
                                        continue
                                if not concepts:
                                    if kind == "topic":
                                        stats["unmatched"] += 1
                                        u = unmatched.setdefault(key, {
                                            "school": school, "grade": grade, "stream": stream,
                                            "series": series, "part": line["text"], "weeks": [],
                                        })
                                        u["weeks"].append(week)
                                    else:
                                        stats[f"nontopic:{kind}"] += 1
                                    continue
                        stats[f"matched:{via}"] += 1
                        rows.append({
                            "tab": tab, "school": school, "grade": grade, "stream": stream,
                            "series": series, "week": week, "text": line["text"],
                            "kind": kind, "is_revision": kind in REVISION_KINDS,
                            "via": via, "concepts": concepts,
                        })

    print(f"  {title}: {len(tabs)} tabs read, {stats['cells']} filled cells, "
          f"weeks with entries: {', '.join(str(w) for w in sorted(weeks_seen)) or 'none yet'}")
    if per_tab:
        print("  cells per tab: " + ", ".join(f"{t} {n}" for t, n in sorted(per_tab.items())))
    matched = sum(v for k, v in stats.items() if k.startswith("matched:"))
    print(f"  parts: {stats['parts']}, matched {matched} "
          f"(parser {stats['matched:parser']}, this pipeline's AI {stats['matched:ai']}, "
          f"July AI {stats['matched:july']}), unmatched {stats['unmatched']} "
          f"({len(unmatched)} distinct, {stats['held_back:above_grade']} of them held back "
          f"for sitting two grades above the tab), reviewed as non-topic {stats['reviewed_nontopic']}")
    nontopic = {k[9:]: v for k, v in stats.items() if k.startswith("nontopic:")}
    if nontopic:
        print("  non-topic parts: " + ", ".join(f"{k} {v}" for k, v in sorted(nontopic.items())))
    if unknown:
        print("  school labels not recognised (add them to school_aliases.json FIX): "
              + ", ".join(f"{s} ({n} cells)" for s, n in unknown.most_common()))
    if args.show_unmatched and unmatched:
        print(f"  most frequent unmatched strings:")
        for u in sorted(unmatched.values(), key=lambda u: -len(u["weeks"]))[: args.show_unmatched]:
            print(f"    {len(u['weeks']):3d}x  {u['school']:<9}{u['grade']}  {u['part'][:60]}")

    if args.dry_run:
        print("  dry run: nothing written.")
        return True

    os.makedirs(SHEETS_DIR, exist_ok=True)
    out = os.path.join(SHEETS_DIR, f"sheet_{year}.json")
    payload = {
        "academic_year": year,
        "spreadsheet_id": spreadsheet_id,
        "title": title,
        "fetched_at": dt.datetime.now().isoformat(timespec="seconds"),
        "stats": dict(stats),
        "rows": rows,
        "unmatched": sorted(unmatched.values(), key=lambda u: (u["school"], u["grade"], u["part"])),
    }
    tmp = out + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, out)
    print(f"  written {os.path.relpath(out, PRIV)}: {len(rows)} rows, {len(unmatched)} unmatched")
    return True


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--year")
    ap.add_argument("--spreadsheet-id")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--show-unmatched", type=int, default=0, metavar="N")
    args = ap.parse_args()

    with open(CONFIG, encoding="utf-8") as fh:
        config = {k: v for k, v in json.load(fh).items() if not k.startswith("_")}
    if args.spreadsheet_id:
        if not args.year:
            sys.exit("--spreadsheet-id needs --year to say which school year it holds.")
        targets = {args.year: {"spreadsheet_id": args.spreadsheet_id}}
    elif args.year:
        if args.year not in config:
            sys.exit(f"{args.year} is not in curriculum_sheets.json.")
        targets = {args.year: config[args.year]}
    else:
        targets = config
    if not targets:
        print("No sheets configured; nothing to import.")
        return 0

    conn = connect()
    cur = conn.cursor()
    matcher, alias_map = load_vocab(cur)
    series_of = school_series_map(cur)
    conn.close()
    ai_map = load_ai_mappings()
    july = load_july_residuals()

    ok = True
    for year, entry in sorted(targets.items()):
        print(f"{year}:")
        ok = import_year(year, entry["spreadsheet_id"], matcher, alias_map,
                         series_of, ai_map, july, args) and ok
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
