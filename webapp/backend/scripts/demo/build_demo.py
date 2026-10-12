"""Build the demo copy of CSM from production, with every person made up.

The demo lives in two databases on the same Cloud SQL server as production.
`csm_demo_base` is the anonymised copy, rebuilt now and then. `csm_demo` is
what the demo app reads, re-made from the base every night with the dates
moved forward so the newest week of data always lands on the current week.
That nightly copy also wipes whatever visitors changed while clicking around.

Run it from the backend directory, which is where it finds `.env`:

    ./venv/bin/python scripts/demo/build_demo.py check     # compare the schema with the column map
    ./venv/bin/python scripts/demo/build_demo.py build     # production -> csm_demo_base, anonymised and scanned
    ./venv/bin/python scripts/demo/build_demo.py scan      # run the leak scan on csm_demo_base again
    ./venv/bin/python scripts/demo/build_demo.py publish   # csm_demo_base -> csm_demo, dates moved to this week

Production is only ever read. Every statement that writes goes to one of the
two demo databases, and `guard_target` stops the script if anything else is
named as a target. The tables in `CLEAR_TABLES` are copied without their rows,
so their contents never leave production at all.

The secret salt for the fake names and the list of people allowed into the
demo live in a file outside the repo, `~/.config/csm-demo/config.json` (or the
path in `DEMO_CONFIG`). The first run creates it. Its `visitors` list looks like
this, and each visitor signs in with Google as they would on the real CSM:

    {"salt": "...", "visitors": [
        {"email": "someone@gmail.com", "name": "Ms Someone", "role": "Supervisor", "location": "MSA"},
        {"email": "you@gmail.com", "tutor_id": 5}
    ]}

A visitor with `tutor_id` takes over that (already faked) tutor's account, so
they see that tutor's own sessions. One without it gets a new account that
doesn't teach, and can use View as to see what any tutor sees.
"""

import argparse
import json
import os
import re
import secrets
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pymysql
from dotenv import load_dotenv

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent.parent
sys.path.insert(0, str(HERE))
load_dotenv(BACKEND / ".env")

from column_map import CLEAR_TABLES, COLUMNS, NO_TEXT_TABLES, SAFE_RULES  # noqa: E402
from fakes import CJK, Faker  # noqa: E402
from stock_text import POOLS, THREADS  # noqa: E402

SOURCE = os.environ.get("DB_NAME", "")
BASE = "csm_demo_base"
DEMO = "csm_demo"
TARGETS = {BASE, DEMO}
CONFIG_PATH = Path(os.environ.get("DEMO_CONFIG", "~/.config/csm-demo/config.json")).expanduser()
HK = timezone(timedelta(hours=8))

TEXT_TYPES = {"char", "varchar", "tinytext", "text", "mediumtext", "longtext", "json", "enum", "set",
              "binary", "varbinary", "tinyblob", "blob", "mediumblob", "longblob"}
DATE_TYPES = {"date", "datetime", "timestamp"}
# Values in "who" columns that are the app itself, not a person.
NOT_PEOPLE = {"system", "system@csmpro.app", "center msa", "center msb"}
# What fraction of students move to another school, so a colleague can't spot
# a real student from their school, form and timetable together.
SCHOOL_SHUFFLE_SHARE = 0.15


# ── Connection and guards ───────────────────────────────────────────────────

def connect():
    conn = pymysql.connect(
        host=os.environ.get("DB_HOST", "localhost"),
        port=int(os.environ.get("DB_PORT", "3306")),
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        charset="utf8mb4",
        autocommit=True,
        connect_timeout=10,
        read_timeout=900,
        write_timeout=900,
    )
    cur = conn.cursor()
    # Tables get created in whatever order they come, and rows are copied
    # before every parent row exists, so the foreign key checks wait.
    cur.execute("SET SESSION foreign_key_checks = 0")
    return conn, cur


def guard_target(name: str):
    """Stop unless `name` is one of the two demo databases."""
    if name not in TARGETS or name == SOURCE:
        raise SystemExit(f"Refusing to write to {name!r}. Only {sorted(TARGETS)} can be written.")


def use(cur, schema: str):
    guard_target(schema)
    cur.execute(f"USE `{schema}`")
    cur.execute("SELECT DATABASE()")
    if cur.fetchone()[0] != schema:
        raise SystemExit(f"Expected to be in {schema}, but the connection isn't.")


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        CONFIG_PATH.write_text(json.dumps({"salt": secrets.token_hex(32), "visitors": []}, indent=2))
        CONFIG_PATH.chmod(0o600)
        print(f"Created {CONFIG_PATH} with a new salt and no visitors yet.")
    return json.loads(CONFIG_PATH.read_text())


# ── Schema reading ──────────────────────────────────────────────────────────

def base_tables(cur, schema):
    cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema=%s AND table_type='BASE TABLE' "
                "ORDER BY table_name", (schema,))
    return [r[0] for r in cur.fetchall()]


def columns(cur, schema, table):
    """(name, data_type, nullable, extra) for each column, in table order."""
    cur.execute("SELECT column_name, data_type, is_nullable='YES', extra FROM information_schema.columns "
                "WHERE table_schema=%s AND table_name=%s ORDER BY ordinal_position", (schema, table))
    return cur.fetchall()


def is_generated(extra: str) -> bool:
    return "VIRTUAL GENERATED" in extra or "STORED GENERATED" in extra


def text_columns(cur, schema, table):
    return [c for c in columns(cur, schema, table) if c[1] in TEXT_TYPES and not is_generated(c[3])]


def primary_key(cur, schema, table):
    cur.execute("SELECT column_name FROM information_schema.key_column_usage "
                "WHERE table_schema=%s AND table_name=%s AND constraint_name='PRIMARY'", (schema, table))
    keys = [r[0] for r in cur.fetchall()]
    if len(keys) != 1:
        raise SystemExit(f"{table} needs a single-column primary key for the demo build.")
    return keys[0]


def on_update_columns(cur, schema, table):
    """Columns that MySQL stamps with the time on every UPDATE.

    Setting such a column to itself stops the stamp, which keeps "last
    modified" times real instead of all becoming the moment of the build.
    """
    return [c[0] for c in columns(cur, schema, table) if "on update" in c[3].lower()]


# ── The column map check ────────────────────────────────────────────────────

def check_map(cur, schema) -> list[str]:
    problems = []
    for table in base_tables(cur, schema):
        if table.startswith("_demo_") or table in CLEAR_TABLES:
            continue
        cols = text_columns(cur, schema, table)
        if table in NO_TEXT_TABLES:
            if cols:
                problems.append(f"{table} is listed as having no text, but has {', '.join(c[0] for c in cols)}")
            continue
        if table not in COLUMNS:
            problems.append(f"{table} is a new table that the column map doesn't mention")
            continue
        for name, *_ in cols:
            if name not in COLUMNS[table]:
                problems.append(f"{table}.{name} is a text column that the column map doesn't mention")
        names = {c[0] for c in cols}
        for name in COLUMNS[table]:
            if name not in names:
                problems.append(f"{table}.{name} is in the column map but not in the database")
    return problems


# ── Copying a schema ────────────────────────────────────────────────────────

DEFINER = re.compile(r"DEFINER=`[^`]*`@`[^`]*`\s*")


def copy_schema(cur, source, target, shift_days=0, skip_rows=frozenset()):
    """Copy every table, function, view and trigger from `source` into `target`.

    `target` is dropped and made again first. Date and time columns are moved
    forward by `shift_days`. Tables in `skip_rows` are created empty.
    """
    guard_target(target)
    cur.execute("SELECT default_character_set_name, default_collation_name FROM information_schema.schemata "
                "WHERE schema_name=%s", (source,))
    charset, collation = cur.fetchone()
    cur.execute(f"DROP DATABASE IF EXISTS `{target}`")
    cur.execute(f"CREATE DATABASE `{target}` CHARACTER SET {charset} COLLATE {collation}")
    use(cur, target)

    tables = base_tables(cur, source)
    for table in tables:
        cur.execute(f"SHOW CREATE TABLE `{source}`.`{table}`")
        cur.execute(cur.fetchone()[1])

    for table in tables:
        if table in skip_rows:
            continue
        cols = [c for c in columns(cur, source, table) if not is_generated(c[3])]
        names = ", ".join(f"`{c[0]}`" for c in cols)
        exprs = ", ".join(
            f"`{c[0]}` + INTERVAL {shift_days} DAY" if shift_days and c[1] in DATE_TYPES else f"`{c[0]}`"
            for c in cols
        )
        cur.execute(f"INSERT INTO `{target}`.`{table}` ({names}) SELECT {exprs} FROM `{source}`.`{table}`")
        print(f"  {table}: {cur.rowcount} rows")

    cur.execute("SELECT routine_name, routine_type FROM information_schema.routines WHERE routine_schema=%s", (source,))
    for name, kind in cur.fetchall():
        cur.execute(f"SHOW CREATE {kind} `{source}`.`{name}`")
        cur.execute(DEFINER.sub("", cur.fetchone()[2]).replace(f"`{source}`.", f"`{target}`."))

    # Views can read other views, so keep going round until all of them exist.
    cur.execute("SELECT table_name FROM information_schema.views WHERE table_schema=%s", (source,))
    pending = {}
    for (name,) in cur.fetchall():
        cur.execute(f"SHOW CREATE VIEW `{source}`.`{name}`")
        pending[name] = DEFINER.sub("", cur.fetchone()[1]).replace(f"`{source}`.", f"`{target}`.")
    while pending:
        progress = False
        for name, ddl in list(pending.items()):
            try:
                cur.execute(ddl)
            except pymysql.err.ProgrammingError as e:
                if e.args[0] == 1146:  # it reads a view that doesn't exist yet
                    continue
                raise
            del pending[name]
            progress = True
        if not progress:
            raise SystemExit(f"Could not create these views: {sorted(pending)}")

    # Triggers go in last, so copying the rows didn't set them off.
    cur.execute("SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema=%s", (source,))
    for (name,) in cur.fetchall():
        cur.execute(f"SHOW CREATE TRIGGER `{source}`.`{name}`")
        cur.execute(DEFINER.sub("", cur.fetchone()[2]).replace(f"`{source}`.", f"`{target}`."))


# ── Writing changes ─────────────────────────────────────────────────────────

class Writer:
    """Applies changes to one table in the base copy, a whole column at a time."""

    def __init__(self, cur, table):
        self.cur = cur
        self.table = table
        self.pk = primary_key(cur, BASE, table)
        self.keep_stamps = "".join(f", t.`{c}` = t.`{c}`" for c in on_update_columns(cur, BASE, table))

    def rows(self, *cols, where=""):
        names = ", ".join(f"`{c}`" for c in (self.pk, *cols))
        self.cur.execute(f"SELECT {names} FROM `{BASE}`.`{self.table}` {where}")
        return self.cur.fetchall()

    def distinct(self, col):
        # Compared as bytes, because the columns ignore case and a plain
        # DISTINCT would fold "Iris Lou" and "iris lou" into one value,
        # leaving the second spelling without a fake.
        self.cur.execute(f"SELECT DISTINCT CAST(`{col}` AS BINARY) FROM `{BASE}`.`{self.table}` "
                         f"WHERE `{col}` IS NOT NULL AND `{col}` != ''")
        return [r[0].decode("utf-8") for r in self.cur.fetchall()]

    def by_value(self, col, mapping: dict):
        """Swap every value found in `mapping` for its fake, matching exactly."""
        pairs = [(real.encode(), fake) for real, fake in mapping.items() if real != fake]
        if not pairs:
            return 0
        self.cur.execute("DROP TEMPORARY TABLE IF EXISTS _swap")
        self.cur.execute("CREATE TEMPORARY TABLE _swap (real_v VARBINARY(3000) PRIMARY KEY, fake_v LONGTEXT)")
        self.cur.executemany("INSERT INTO _swap VALUES (%s, %s)", pairs)
        self.cur.execute(f"UPDATE `{BASE}`.`{self.table}` t JOIN _swap s ON CAST(t.`{col}` AS BINARY) = s.real_v "
                         f"SET t.`{col}` = s.fake_v{self.keep_stamps}")
        changed = self.cur.rowcount
        self.cur.execute("DROP TEMPORARY TABLE _swap")
        return changed

    def by_row(self, col, values: dict):
        """Set `col` row by row, from a {primary key: new value} dict."""
        if not values:
            return 0
        self.cur.execute("DROP TEMPORARY TABLE IF EXISTS _rowset")
        self.cur.execute("CREATE TEMPORARY TABLE _rowset (pk BIGINT PRIMARY KEY, v LONGTEXT NULL)")
        items = list(values.items())
        for i in range(0, len(items), 2000):
            self.cur.executemany("INSERT INTO _rowset VALUES (%s, %s)", items[i:i + 2000])
        self.cur.execute(f"UPDATE `{BASE}`.`{self.table}` t JOIN _rowset r ON t.`{self.pk}` = r.pk "
                         f"SET t.`{col}` = r.v{self.keep_stamps}")
        self.cur.execute("DROP TEMPORARY TABLE _rowset")
        return len(values)

    def empty(self, col, nullable, data_type):
        blank = "NULL" if nullable else ("'[]'" if data_type == "json" else "''")
        self.cur.execute(f"UPDATE `{BASE}`.`{self.table}` t SET t.`{col}` = {blank}{self.keep_stamps} "
                         f"WHERE t.`{col}` IS NOT NULL")


def trie_pattern(words) -> str:
    """One regular expression matching any of `words`, built as a trie.

    A plain "a|b|c" list of three thousand names makes Python try every name
    at every character, which took over ten minutes on the first run. Folding
    the names into a tree of shared beginnings ("Ch(an|eang|eong)") lets each
    character be checked once. Longer matches are tried first, so "1263
    Pasco Lui" wins over "Pasco Lui".
    """
    trie: dict = {}
    for word in words:
        node = trie
        for ch in word:
            node = node.setdefault(ch, {})
        node[""] = {}

    def build(node) -> str:
        branches = [re.escape(ch) + build(child) for ch, child in sorted(node.items()) if ch]
        if "" in node:
            branches.append("")
        if len(branches) == 1:
            return branches[0]
        return "(?:" + "|".join(branches) + ")"

    return build(trie)


# ── Anonymising ─────────────────────────────────────────────────────────────

class Anonymiser:
    def __init__(self, cur, salt):
        self.cur = cur
        self.faker = Faker(salt)
        # Exact strings that stand for a staff member: emails, display names,
        # names without the honorific, and nicknames.
        self.staff: dict[str, str] = {}
        self.staff_first_names: set[str] = set()
        self.student_tags: dict[str, str] = {}   # "1263 Pasco Lui" -> its fake
        self.real_emails: set[str] = set()
        self.real_names: set[str] = set()   # filled in from real_identities before anything runs
        self._subst = None

    # The staff list comes first, so a tutor's name means the same fake
    # person wherever it appears.
    def tutors(self):
        w = Writer(self.cur, "tutors")
        f = self.faker
        updates = defaultdict(dict)
        for pk, email, name, nickname, salary in w.rows("user_email", "tutor_name", "nickname", "basic_salary"):
            fake_name = f.tutor(name)
            self.staff[name] = fake_name
            words = name.split()
            if fake_name != name and words[0] in ("Mr", "Ms", "Mrs", "Miss"):
                self.staff[" ".join(words[1:])] = " ".join(fake_name.split()[1:])
                self.staff_first_names.add(words[1])
            fake_email = f.email(email, fake_name if fake_name != name else None)
            self.staff[email] = fake_email
            self.staff[email.lower()] = fake_email
            self.real_emails.add(email.lower())
            # Addresses are sometimes stored without the "resigned" prefix.
            if email.lower().startswith("resigned"):
                self.staff[email[len("resigned"):]] = fake_email[len("resigned"):]
                self.real_emails.add(email[len("resigned"):].lower())
            updates["tutor_name"][pk] = fake_name
            updates["user_email"][pk] = fake_email
            if nickname:
                fake_nick = f.nickname(nickname, name, fake_name)
                self.staff[nickname] = fake_nick
                updates["nickname"][pk] = fake_nick
            if salary:
                updates["basic_salary"][pk] = f.rng("salary", str(pk)).randrange(12000, 24001, 500)
        for col, values in updates.items():
            w.by_row(col, values)
        print(f"  tutors: {len(updates['tutor_name'])} faked")

    def who(self, value: str) -> str:
        if value in self.staff:
            return self.staff[value]
        if value.strip().lower() in NOT_PEOPLE:
            return value
        if "@" in value:
            self.real_emails.add(value.strip().lower())
            return self.faker.email(value)
        return self.faker.person(value)

    def students(self):
        """Shuffle the centre's own student numbers, and move some students' schools."""
        w = Writer(self.cur, "students")
        rows = w.rows("school_student_id", "student_name", "home_location", "school", "lang_stream")
        by_location = defaultdict(list)
        for pk, sid, name, loc, school, stream in rows:
            if sid:
                by_location[loc].append((pk, sid))
        new_ids = {}
        for loc, items in by_location.items():
            ids = [sid for _, sid in items]
            shuffled = ids[:]
            self.faker.rng("student-ids", loc or "").shuffle(shuffled)
            for (pk, _), new in zip(items, shuffled):
                new_ids[pk] = new
        # Two steps, so no two rows ever hold the same number for a moment
        # and trip the unique key on (number, branch).
        w.by_row("school_student_id", {pk: "~" + v for pk, v in new_ids.items()})
        self.cur.execute(f"UPDATE `{BASE}`.`students` t SET t.school_student_id = SUBSTRING(t.school_student_id, 2)"
                         f"{w.keep_stamps} WHERE t.school_student_id LIKE '~%'")
        for pk, sid, name, *_ in rows:
            if sid and name:
                self.student_tags[f"{sid} {name}"] = f"{new_ids[pk]} {self.faker.person(name)}"

        counts = defaultdict(lambda: defaultdict(int))
        for _, _, _, _, school, stream in rows:
            if school:
                counts[stream][school] += 1
        choices = {s: [k for k, n in v.items() if n >= 5] for s, v in counts.items()}
        moves = {}
        for pk, _, _, _, school, stream in rows:
            r = self.faker.rng("school", str(pk))
            options = [s for s in choices.get(stream, []) if s != school]
            if school and options and r.random() < SCHOOL_SHUFFLE_SHARE:
                moves[pk] = r.choice(options)
        w.by_row("school", moves)
        print(f"  students: {len(new_ids)} numbers shuffled, {len(moves)} moved school")

    def value_columns(self):
        """Every column where one real value always becomes the same fake."""
        f = self.faker
        for table, cols in sorted(COLUMNS.items()):
            w = None
            for col, how in cols.items():
                if how == "who":
                    make = self.who
                elif how == "person":
                    make = f.person
                elif how == "phone":
                    make = f.phone
                elif how == "wechat":
                    make = f.wechat
                elif how.startswith("code:"):
                    kind = how.split(":", 1)[1]
                    make = lambda v, kind=kind: f.digits(kind, v)  # noqa: E731
                else:
                    continue
                w = w or Writer(self.cur, table)
                values = w.distinct(col)
                changed = w.by_value(col, {v: make(v) for v in values})
                print(f"  {table}.{col}: {len(values)} values, {changed} rows")

    def contacts(self):
        w = Writer(self.cur, "students")
        out = {}
        for pk, raw in w.rows("contacts", where="WHERE contacts IS NOT NULL"):
            items = json.loads(raw) if isinstance(raw, str) else raw
            if not isinstance(items, list):
                continue
            for item in items:
                if isinstance(item, dict) and item.get("phone"):
                    item["phone"] = self.faker.phone(str(item["phone"]))
            out[pk] = json.dumps(items, ensure_ascii=False)
        w.by_row("contacts", out)

    # ── Text swaps, which need every map above to be complete ──

    def subst(self, text: str) -> str:
        """Swap every known real name, email, phone and student tag inside `text`."""
        if self._subst is None:
            pairs = {}
            for real, fake in self.faker.maps.get("person", {}).items():
                if len(real) >= 4 and (" " in real or len(CJK.findall(real)) >= 2):
                    pairs[real.casefold()] = fake
            for real, fake in self.faker.maps.get("phone", {}).items():
                pairs[real.casefold()] = fake
            for real, fake in self.faker.maps.get("email", {}).items():
                pairs[real.casefold()] = fake
            for real, fake in {**self.staff, **self.student_tags}.items():
                if len(real) >= 4:
                    pairs[real.casefold()] = fake
            self._subst = (re.compile(rf"(?<![\w@.])(?:{trie_pattern(pairs)})(?![\w@])", re.IGNORECASE), pairs)
        pattern, pairs = self._subst
        return pattern.sub(lambda m: pairs[m.group(0).casefold()], text)

    def name_words(self) -> set[str]:
        """Every capitalised word of three letters or more in a real person's name."""
        words = set()
        for real in list(self.faker.maps.get("person", {})) + list(self.staff_first_names):
            words.update(w for w in re.findall(r"[A-Za-z]{3,}", real) if w[0].isupper())
        return words - {"Mr", "Mrs", "Miss", "Sir", "Center"}

    def sanitise_path(self, path: str, words: set[str]) -> str:
        """Swap the people's names inside a file path.

        Two kinds of folder are named after people. Staff folders hold each
        tutor's own files, often in a subfolder per student. Folders like
        "1006 Firstname Surname" hold one student's work, named with their
        student number. Below either one, every word that's part of a real
        name is swapped. Anywhere else in a path, a run of two to four words
        that matches a real person's full name is swapped too.
        """
        path = self.swap_full_names(path)
        starts = [m.end() for m in (re.search(r"Staff\]?\\", path), re.search(r"(?:^|\\)(?=\d{3,4} [A-Za-z])", path)) if m]
        if starts:
            cut = min(starts)
            path = path[:cut] + self.swap_words(path[cut:], words)
        return path

    def swap_words(self, text: str, words: set[str]) -> str:
        return re.sub(r"[A-Za-z]+", lambda m: self.faker.first_name_token(m.group(0)) if m.group(0) in words else m.group(0), text)

    def swap_full_names(self, text: str) -> str:
        tokens = list(re.finditer(r"[A-Za-z]+", text))
        lowered = [t.group(0).casefold() for t in tokens]
        marked = set()
        for n in (4, 3, 2):
            for i in range(len(tokens) - n + 1):
                if " ".join(lowered[i:i + n]) in self.real_names:
                    marked.update(range(i, i + n))
        for i in sorted(marked, reverse=True):
            t = tokens[i]
            text = text[:t.start()] + self.faker.first_name_token(t.group(0)) + text[t.end():]
        return text

    def text_columns(self):
        words = self.name_words()
        for table, cols in sorted(COLUMNS.items()):
            meta = {c[0]: c for c in text_columns(self.cur, BASE, table)}
            w = None
            for col, how in cols.items():
                w = w or Writer(self.cur, table)
                values = {}
                if how.startswith("stock:"):
                    pool = POOLS[how.split(":", 1)[1]]
                    for pk, v in w.rows(col, where=f"WHERE `{col}` IS NOT NULL AND `{col}` != ''"):
                        values[pk] = self.faker.rng("stock", f"{table}:{col}:{pk}").choice(pool)
                elif how.startswith("safe:"):
                    _, rule, pool_name = how.split(":")
                    pattern = re.compile(SAFE_RULES[rule])
                    for pk, v in w.rows(col, where=f"WHERE `{col}` IS NOT NULL AND `{col}` != ''"):
                        if pattern.fullmatch(v.strip()):
                            new = self.subst(v)
                        else:
                            new = self.faker.rng("stock", f"{table}:{col}:{pk}").choice(POOLS[pool_name])
                        if new != v:
                            values[pk] = new
                elif how == "subst":
                    for pk, v in w.rows(col, where=f"WHERE `{col}` IS NOT NULL AND `{col}` != ''"):
                        new = self.subst(v)
                        if new != v:
                            values[pk] = new
                elif how == "path":
                    for pk, v in w.rows(col, where=f"WHERE `{col}` IS NOT NULL AND `{col}` != ''"):
                        new = self.sanitise_path(v, words)
                        if new != v:
                            values[pk] = new
                elif how.startswith("path_basename:"):
                    sibling = how.split(":", 1)[1]
                    for pk, v, full in w.rows(col, sibling, where=f"WHERE `{col}` IS NOT NULL AND `{col}` != ''"):
                        inside = re.search(r"Staff\]?\\|(?:^|\\)\d{3,4} [A-Za-z]", full or "")
                        new = self.swap_full_names(v)
                        new = self.swap_words(new, words) if inside else new
                        if new != v:
                            values[pk] = new
                elif how == "url":
                    self.cur.execute(f"UPDATE `{BASE}`.`{table}` t SET t.`{col}` = NULL{w.keep_stamps} "
                                     f"WHERE t.`{col}` LIKE '%%docs.google.com%%' OR t.`{col}` LIKE '%%drive.google.com%%'")
                    continue
                elif how == "null":
                    _, data_type, nullable, _ = meta[col]
                    w.empty(col, nullable, data_type)
                    continue
                else:
                    continue
                if values:
                    w.by_row(col, values)
                    print(f"  {table}.{col}: {len(values)} rows rewritten")

    def parent_communications(self):
        pools = {"Progress Update": "parent_comm_progress", "Concern": "parent_comm_concern",
                 "Course Renewal": "parent_comm_renewal"}
        w = Writer(self.cur, "parent_communications")
        values = {}
        for pk, kind, note in w.rows("contact_type", "brief_notes", where="WHERE brief_notes IS NOT NULL AND brief_notes != ''"):
            pool = POOLS[pools.get(kind, "parent_comm_general")]
            values[pk] = self.faker.rng("stock", f"parent_communications:{pk}").choice(pool)
        w.by_row("brief_notes", values)

    def messages(self):
        """Replace what tutors wrote to each other, keeping the threads and their shape.

        Make-up confirmations are written by the app, so they keep their text
        with the names swapped. Every other thread becomes one of the stock
        threads in `stock_text.THREADS`, with its replies in order.
        """
        w = Writer(self.cur, "tutor_messages")
        rows = w.rows("reply_to_id", "category", "subject", "message")
        parent = {pk: reply_to for pk, reply_to, *_ in rows}

        def root(pk):
            seen = set()
            while parent.get(pk) and pk not in seen:
                seen.add(pk)
                pk = parent[pk]
            return pk

        subjects, bodies = {}, {}
        for pk, reply_to, category, subject, message in rows:
            if category == "MakeupConfirmation":
                subjects[pk] = self.subst(subject) if subject else subject
                bodies[pk] = self.subst(message)
                continue
            key = category if category in THREADS else None
            thread_root = root(pk)
            subject_line, opener, replies = self.faker.rng("msg-thread", str(thread_root)).choice(THREADS[key])
            if subject:
                subjects[pk] = subject_line if not reply_to else f"Re: {subject_line}"
            if not reply_to:
                body = opener
            else:
                # Replies take the thread's lines in turn, by their place in the thread.
                position = sorted(p for p, *_ in rows if root(p) == thread_root).index(pk) - 1
                body = replies[position % len(replies)]
            bodies[pk] = f"<p>{body}</p>" if message and message.lstrip().startswith("<") else body
        w.by_row("subject", subjects)
        w.by_row("message", bodies)
        print(f"  tutor_messages: {len(bodies)} rewritten")

    def visitors(self, visitors):
        """Let the people in the config file sign in with their own Google accounts."""
        for v in visitors:
            email = v["email"].strip()
            self.cur.execute(f"DELETE FROM `{BASE}`.`tutors` WHERE user_email = %s", (email,))
            if v.get("tutor_id"):
                self.cur.execute(f"UPDATE `{BASE}`.`tutors` SET user_email = %s WHERE id = %s", (email, v["tutor_id"]))
                print(f"  visitor {email} takes over tutor {v['tutor_id']}")
            else:
                self.cur.execute(
                    f"INSERT INTO `{BASE}`.`tutors` (user_email, tutor_name, role, default_location, is_active_tutor) "
                    "VALUES (%s, %s, %s, %s, 0)",
                    (email, v.get("name") or "Visitor", v.get("role") or "Supervisor", v.get("location") or "MSA"))
                print(f"  visitor {email} added as {v.get('role') or 'Supervisor'}")


# ── The leak scan ───────────────────────────────────────────────────────────

LATIN_WORD = re.compile(r"[a-z]+")
# The length limits matter. Without them, a long run of letters with no "@"
# in it (a picture embedded in a document as base64) makes the pattern
# re-scan the whole run from every starting point, and the scan never ends.
EMAIL = re.compile(r"[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,4}")
DATA_URI = re.compile(r"data:[\w/+.-]+;base64,[A-Za-z0-9+/=]+")
PHONE = re.compile(r"(?<!\d)(?:\+?853|00853)?(\d{8})(?!\d)")


def real_identities(cur):
    """Everything personal in production that must not appear in the demo.

    This reads production directly, so it's complete however the base copy
    was made.
    """
    names, phones, emails = set(), set(), set()
    for table, cols in COLUMNS.items():
        for col, how in cols.items():
            if how not in ("person", "who", "phone", "wechat", "contacts") and not (table == "tutors" and how == "special"):
                continue
            cur.execute(f"SELECT DISTINCT `{col}` FROM `{SOURCE}`.`{table}` WHERE `{col}` IS NOT NULL")
            for (value,) in cur.fetchall():
                value = str(value)
                emails.update(e.lower() for e in EMAIL.findall(value))
                phones.update(PHONE.findall(value))
                if (how in ("person", "who") or col == "tutor_name") and "@" not in value:
                    # Only whole alphabetic words count, so a code typed into
                    # a name field (like a buddy code "BG-U3X") isn't
                    # mistaken for a name.
                    words = [w for w in value.split() if w.isalpha() and not CJK.search(w)]
                    if words and words[0] in ("Mr", "Ms", "Mrs", "Miss"):
                        words = words[1:]
                    latin = [w.casefold() for w in words]
                    if len(latin) >= 2:
                        names.add(" ".join(latin))
                    for run in re.findall(r"[㐀-鿿]{3,}", value):
                        names.add(run[:4])
    emails -= NOT_PEOPLE
    names -= NOT_PEOPLE
    return names, phones, emails


def leak_scan(cur, visitors) -> int:
    names, phones, emails = real_identities(cur)
    # The visitors are real people on purpose: they sign in as themselves.
    emails -= {v["email"].strip().lower() for v in visitors}
    for v in visitors:
        if v.get("name"):
            names.discard(" ".join(LATIN_WORD.findall(v["name"].casefold().replace("mr ", "").replace("ms ", ""))))
    print(f"Scanning for {len(names)} real names, {len(phones)} phone numbers and {len(emails)} emails")
    hits = defaultdict(list)
    for table in base_tables(cur, BASE):
        if table.startswith("_demo_") or table in CLEAR_TABLES:
            continue
        for col, *_ in text_columns(cur, BASE, table):
            cur.execute(f"SELECT `{col}` FROM `{BASE}`.`{table}` WHERE `{col}` IS NOT NULL AND `{col}` != ''")
            for (value,) in cur.fetchall():
                text = value.decode("utf-8", "replace") if isinstance(value, bytes) else str(value)
                text = DATA_URI.sub("", text)
                found = [e for e in EMAIL.findall(text) if e.lower() in emails] if "@" in text else []
                found += [p for p in PHONE.findall(text) if p in phones]
                words = LATIN_WORD.findall(text.casefold())
                for n in (2, 3, 4):
                    found += [" ".join(words[i:i + n]) for i in range(len(words) - n + 1)
                              if " ".join(words[i:i + n]) in names]
                for run in re.findall(r"[㐀-鿿]{3,}", text):
                    found += [run[i:i + k] for k in (3, 4) for i in range(len(run) - k + 1) if run[i:i + k] in names]
                if found:
                    hits[f"{table}.{col}"].extend(found)
    total = sum(len(v) for v in hits.values())
    for where, found in sorted(hits.items()):
        sample = ", ".join(sorted({_mask(f) for f in found})[:3])
        print(f"  LEAK {where}: {len(found)} matches, for example {sample}")
    print("Leak scan passed." if not total else f"Leak scan FAILED with {total} matches.")
    return total


def _mask(value: str) -> str:
    """Show enough of a match to find it, without printing the whole thing."""
    return " ".join(w[:2] + "*" * max(len(w) - 2, 1) for w in value.split()) if " " in value else value[:3] + "***"


# ── Commands ────────────────────────────────────────────────────────────────

def set_meta(cur, schema, **values):
    guard_target(schema)
    cur.execute(f"CREATE TABLE IF NOT EXISTS `{schema}`.`_demo_meta` (k VARCHAR(64) PRIMARY KEY, v TEXT)")
    for k, v in values.items():
        cur.execute(f"REPLACE INTO `{schema}`.`_demo_meta` VALUES (%s, %s)", (k, str(v)))


def get_meta(cur, schema) -> dict:
    try:
        cur.execute(f"SELECT k, v FROM `{schema}`.`_demo_meta`")
    except pymysql.err.ProgrammingError:
        return {}
    return dict(cur.fetchall())


def cmd_check(cur):
    problems = check_map(cur, SOURCE)
    for p in problems:
        print(f"  {p}")
    print("The column map covers every text column." if not problems else f"{len(problems)} problems.")
    return 1 if problems else 0


def cmd_build(cur, config):
    if SOURCE in TARGETS:
        raise SystemExit("DB_NAME points at a demo database. Run this against the production settings.")
    problems = check_map(cur, SOURCE)
    if problems:
        for p in problems:
            print(f"  {p}")
        raise SystemExit("Fix the column map before building.")
    print(f"Copying {SOURCE} into {BASE}")
    copy_schema(cur, SOURCE, BASE, skip_rows=CLEAR_TABLES)
    set_meta(cur, BASE, built_on=datetime.now(HK).date().isoformat(), leak_scan="not run")
    use(cur, BASE)
    a = Anonymiser(cur, config["salt"])
    names, phones, emails = real_identities(cur)
    a.faker.avoid = {"person": names, "phone": phones, "email": emails}
    a.real_names = names
    print("Faking staff and students")
    a.tutors()
    a.students()
    a.value_columns()
    a.contacts()
    print("Replacing typed text")
    a.text_columns()
    a.parent_communications()
    a.messages()
    a.visitors(config.get("visitors", []))
    return cmd_scan(cur, config)


def cmd_scan(cur, config):
    use(cur, BASE)
    total = leak_scan(cur, config.get("visitors", []))
    set_meta(cur, BASE, leak_scan="passed" if not total else f"failed with {total} matches")
    return 1 if total else 0


def cmd_publish(cur):
    meta = get_meta(cur, BASE)
    if meta.get("leak_scan") != "passed":
        raise SystemExit(f"{BASE} hasn't passed the leak scan ({meta.get('leak_scan', 'never built')}), so it won't be published.")
    built_on = datetime.fromisoformat(meta["built_on"]).date()
    today = datetime.now(HK).date()
    # Whole weeks only, so a Tuesday lesson stays on a Tuesday.
    shift = (today - built_on).days // 7 * 7
    print(f"Copying {BASE} into {DEMO}, moving dates forward {shift} days")
    copy_schema(cur, BASE, DEMO, shift_days=shift)
    set_meta(cur, DEMO, published_on=today.isoformat(), shift_days=shift)
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["check", "build", "scan", "publish"])
    args = parser.parse_args()
    if not SOURCE:
        raise SystemExit("DB_NAME isn't set. Run this from the backend directory, where .env is.")
    conn, cur = connect()
    try:
        if args.command == "check":
            return cmd_check(cur)
        if args.command == "publish":
            return cmd_publish(cur)
        config = load_config()
        return cmd_build(cur, config) if args.command == "build" else cmd_scan(cur, config)
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
