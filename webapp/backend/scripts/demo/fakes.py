"""Made-up names, phone numbers and handles in the same shapes as the real ones.

Every fake is chosen by a random generator seeded from the real value and a
secret salt. That means the same real person gets the same fake identity on
every rebuild, so screenshots in the guide stay correct after the demo is
refreshed. The salt has to stay secret: without it, someone holding this code
could try likely real names until one produced a fake they had seen.

The real data is from a Macau centre, so the surnames are Macau
romanisations (Leong, Ieong, Sio, Cheang) and local mobile numbers are eight
digits starting with 6.
"""

import hashlib
import hmac
import random
import re
import string

ENGLISH_MALE = [
    "Aaron", "Adrian", "Aiden", "Alan", "Alex", "Alvin", "Andy", "Anson", "Arthur", "Ben",
    "Brandon", "Brian", "Bryan", "Calvin", "Carson", "Chris", "Cyrus", "Daniel", "Darren",
    "Dennis", "Derek", "Dominic", "Edwin", "Elvis", "Eric", "Ethan", "Felix", "Frankie",
    "Gavin", "Gordon", "Harry", "Henry", "Ian", "Isaac", "Ivan", "Jacky", "Jason", "Jayden",
    "Jerry", "Joe", "Jonathan", "Justin", "Kelvin", "Ken", "Kevin", "Kyle", "Lucas", "Marco",
    "Martin", "Matthew", "Max", "Nathan", "Neo", "Oscar", "Owen", "Patrick", "Peter", "Raymond",
    "Ricky", "Ryan", "Sammy", "Sean", "Stanley", "Steven", "Terry", "Timothy", "Tony", "Victor",
    "Vincent", "Wilson", "Winson", "Zack",
]
ENGLISH_FEMALE = [
    "Abby", "Ada", "Alice", "Amy", "Angel", "Anna", "Ashley", "Bonnie", "Candy", "Carmen",
    "Cherry", "Chloe", "Christy", "Cindy", "Daisy", "Doris", "Elaine", "Ella", "Emily", "Emma",
    "Fiona", "Gloria", "Grace", "Hailey", "Hannah", "Helen", "Iris", "Ivy", "Jade", "Janice",
    "Jasmine", "Jessica", "Joanne", "Joyce", "Karen", "Katie", "Kelly", "Kiki", "Lily", "Lisa",
    "Liz", "Mandy", "Maggie", "Mia", "Michelle", "Nicole", "Olivia", "Peggy", "Phoebe",
    "Queenie", "Rachel", "Rita", "Sandy", "Sharon", "Sophie", "Stephanie", "Sylvia", "Tiffany",
    "Tracy", "Vanessa", "Vivian", "Wendy", "Winnie", "Yoyo", "Zoe",
]
ENGLISH_ANY = ENGLISH_MALE + ENGLISH_FEMALE

MACAU_SURNAMES = [
    "Chan", "Wong", "Leong", "Lei", "Ieong", "Sio", "Cheang", "Lam", "Lau", "Ho", "Lo",
    "Choi", "Chao", "Kuok", "Fong", "Iao", "U", "Tam", "Lou", "Sou", "Wu", "Chong", "Kou",
    "Vong", "Lio", "Mok", "Ng", "Tang", "Che", "Si", "Cheong", "Pun", "Yu", "Fan", "Lai",
    "Tong", "Un", "Kam", "Hoi", "Ip", "Mak", "Chio", "Ung", "Kong", "Sit", "Lok",
]
# Cantonese given-name syllables as Macau writes them in Portuguese-style romanisation.
CANTONESE_GIVEN = [
    "Hoi", "Kei", "Ka", "Wai", "Man", "Chi", "Hin", "Long", "Pak", "Teng", "Hang", "Ian",
    "Sin", "Iok", "Lam", "Cheng", "Fong", "Kin", "Chon", "Hou", "Weng", "Tou", "Nga", "Sam",
    "Ieng", "Mei", "Kit", "Lok", "Ngai", "Sut", "Cheok", "Kuan", "Hei", "Wing", "Lai", "Tin",
    "Seng", "Io", "In", "Sio",
]
CHINESE_SURNAMES = "陳黃梁李楊蕭鄭林劉何盧蔡周郭方吳區譚張馮麥葉"
CHINESE_GIVEN = "嘉思穎樂浩俊詠晴子朗曉欣家宇卓希凱琳雅明志皓銘婷柏霖翠瑜鈞健"

HONORIFICS = ("Mr", "Mrs", "Ms", "Miss")
CJK = re.compile(r"[㐀-鿿]")
FAKE_EMAIL_DOMAIN = "example.com"


class Faker:
    """Hands out fakes and remembers them, so one real value gets one fake.

    `avoid` holds every real value of the same kind. A fake that happens to
    equal a real value is thrown away, because it would look like a leak in
    the leak scan and could point at a real person.
    """

    def __init__(self, salt: str):
        self.salt = salt.encode()
        self.maps: dict[str, dict[str, str]] = {}
        self.used: dict[str, set[str]] = {}
        self.avoid: dict[str, set[str]] = {}

    def rng(self, kind: str, real: str, attempt: int = 0) -> random.Random:
        digest = hmac.new(self.salt, f"{kind}\x00{real}\x00{attempt}".encode(), hashlib.sha256).digest()
        return random.Random(int.from_bytes(digest[:8], "big"))

    def _unique(self, kind: str, real: str, make, strict: bool = True) -> str:
        """Return the fake for `real`, making one the first time it's asked for.

        With `strict` off, two real values may share a fake and a fake may
        match a real value. That's right for a lone first name like "Ryan",
        where repeats are normal and there are only so many names to go round.
        """
        known = self.maps.setdefault(kind, {})
        if real in known:
            return known[real]
        if not strict:
            fake = make(self.rng(kind, real), 0)
            known[real] = fake
            return fake
        used = self.used.setdefault(kind, set())
        for attempt in range(200):
            fake = make(self.rng(kind, real, attempt), attempt)
            key = fake.casefold()
            if key not in used and not self.collides(kind, fake):
                break
        else:
            raise RuntimeError(f"Could not find an unused fake {kind} for a value")
        used.add(key)
        known[real] = fake
        return fake

    def collides(self, kind: str, fake: str) -> bool:
        """True when the fake could be mistaken for a real value.

        `avoid` holds real values in the form the leak scan uses: names as
        lower-case Latin words joined by spaces (without the honorific) or
        runs of three or four Chinese characters, and phone numbers as their
        last eight digits. A name collides if any two to four words in a row
        match a real name, because "Kelvin Leong Hoi Kei" would otherwise
        carry a real "Leong Hoi Kei" inside it.
        """
        avoid = self.avoid.get(kind)
        if not avoid:
            return False
        if kind == "phone":
            return re.sub(r"\D", "", fake)[-8:] in avoid
        if kind == "person":
            words = [w for w in re.findall(r"[a-z]+", fake.casefold()) if w not in ("mr", "mrs", "ms", "miss")]
            grams = {" ".join(words[i:i + n]) for n in (2, 3, 4) for i in range(len(words) - n + 1)}
            chinese = "".join(CJK.findall(fake))
            grams |= {chinese[i:i + k] for k in (3, 4) for i in range(len(chinese) - k + 1)}
            return bool(grams & avoid)
        return fake.casefold() in avoid

    # ── People ──────────────────────────────────────────────────────────────

    def person(self, real: str) -> str:
        """A fake name in the same shape as the real one.

        The number of Latin words decides the shape. One word is an English
        name alone ("Andrew"), two is "English Surname" ("Chloe Lau"), three
        is "Surname Given Given" ("Leong Hoi Kei"), and four or more is
        "English Surname Given Given" ("Ryan Pun Pak Ieong"). Chinese
        characters are replaced with a Chinese name of similar length. An
        honorific at the front is kept, and decides whether the English name
        is male or female.
        """
        if real is None or not real.strip():
            return real
        value = real.strip()
        several_words = len(value.split()) > 1 or len(CJK.findall(value)) > 1
        return self._unique("person", value, lambda r, _: _person_shape(r, value), strict=several_words)

    def tutor(self, real_name: str) -> str:
        """A tutor's display name, always "Mr First Surname" style."""
        if real_name.split()[0] not in HONORIFICS:
            # Not a person, for example the "Center MSA" guest account.
            return real_name
        known = self.maps.get("person", {})
        if real_name.strip() in known:
            return known[real_name.strip()]
        # Each tutor gets a first name nobody else on the staff has, because
        # the app shows nicknames like "Edwin Sir" on their own.
        taken = self.used.setdefault("tutor-first", set())

        def make(r, attempt):
            for _ in range(100):
                fake = _tutor_shape(r, real_name.strip())
                if fake.split()[1] not in taken:
                    return fake
            return fake

        fake = self._unique("person", real_name.strip(), make)
        taken.add(fake.split()[1])
        return fake

    def nickname(self, real_nickname: str, real_name: str, fake_name: str) -> str:
        """Swap the tutor's first name inside "David Sir" or "Miss Bella"."""
        real_first = _first_name(real_name)
        fake_first = _first_name(fake_name)
        if real_first and real_first in real_nickname:
            return real_nickname.replace(real_first, fake_first)
        return f"{fake_first} Sir" if real_name.startswith("Mr") else f"Miss {fake_first}"

    def email(self, real: str, name_hint: str | None = None) -> str:
        """A fake email. Tutors get first.last, everyone else a made-up handle.

        A "resigned" prefix on the real address is kept, because the app reads
        it to tell former staff apart.
        """
        def make(r, attempt):
            prefix = "resigned" if real.lower().startswith("resigned") else ""
            if name_hint:
                words = [w for w in re.findall(r"[A-Za-z]+", name_hint) if w not in HONORIFICS]
                local = ".".join(w.lower() for w in words[:2]) or "staff"
                # The same tutor can have two accounts, so a second address
                # for one name gets a number on the end.
                if attempt:
                    local += str(attempt + 1)
            else:
                local = r.choice(ENGLISH_ANY).lower() + str(r.randint(10, 99))
            return f"{prefix}{local}@{FAKE_EMAIL_DOMAIN}"
        return self._unique("email", real.strip().lower(), make)

    # ── Numbers and handles ─────────────────────────────────────────────────

    def phone(self, real: str) -> str:
        """Keep the country prefix and the first local digit, randomise the rest."""
        if real is None or not re.search(r"\d", real):
            return real
        return self._unique("phone", real.strip(), lambda r, _: _phone_shape(r, real.strip()))

    def wechat(self, real: str) -> str:
        """WeChat IDs are often just the phone number, so those become fake phones."""
        if real is None or not real.strip():
            return real
        value = real.strip()
        if re.fullmatch(r"\+?\d{8,}", value):
            return self.phone(value)
        def make(r, attempt):
            if value.lower().startswith("wxid_"):
                return "wxid_" + "".join(r.choice(string.ascii_lowercase + string.digits) for _ in range(len(value) - 5))
            handle = r.choice(ENGLISH_ANY)
            handle = handle.lower() if value == value.lower() else handle
            # A digit suffix, never a surname: "chloe_lou" would read as a
            # person's full name.
            if re.search(r"\d", value) or r.random() < 0.5:
                handle += str(r.randint(1, 9999))
            return handle
        return self._unique("wechat", value, make)

    def digits(self, kind: str, real: str) -> str:
        """Keep the letters of a code like MCP1112 and change its digits."""
        if real is None or not real.strip():
            return real
        return self._unique(kind, real.strip(), lambda r, _: re.sub(r"\d", lambda _: str(r.randint(0, 9)), real.strip()))

    def first_name_token(self, real_token: str) -> str:
        """A one-word stand-in for a name word found inside a file path."""
        return self._unique("token", real_token, lambda r, _: r.choice(ENGLISH_ANY), strict=False)


def _first_name(name: str) -> str:
    words = [w for w in name.split() if w not in HONORIFICS]
    return words[0] if words else ""


def _match_case(fake: str, real: str) -> str:
    if real.isalpha() and real == real.lower():
        return fake.lower()
    if real.isalpha() and len(real) > 1 and real == real.upper():
        return fake.upper()
    return fake


def _person_shape(r: random.Random, real: str) -> str:
    words = real.split()
    honorific = words[0] if words and words[0].rstrip(".") in HONORIFICS else None
    if honorific:
        words = words[1:]
    latin = [w for w in words if not CJK.search(w)]
    cjk_len = sum(len(CJK.findall(w)) for w in words)
    if honorific:
        english = r.choice(ENGLISH_MALE if honorific.startswith("Mr") and honorific != "Mrs" else ENGLISH_FEMALE)
    else:
        english = r.choice(ENGLISH_ANY)
    surname = r.choice(MACAU_SURNAMES)
    given = [r.choice(CANTONESE_GIVEN), r.choice(CANTONESE_GIVEN).lower()]
    n = len(latin)
    if n == 0:
        out = []
    elif n == 1:
        out = [english]
    elif n == 2:
        out = [english, surname]
    elif n == 3:
        out = [surname, given[0], given[1].capitalize()]
    else:
        out = [english, surname, given[0], given[1].capitalize()]
    out = [_match_case(f, latin[min(i, n - 1)]) for i, f in enumerate(out)]
    if cjk_len:
        length = min(max(cjk_len, 2), 4) if cjk_len <= 4 else 3
        out.append(r.choice(CHINESE_SURNAMES) + "".join(r.choice(CHINESE_GIVEN) for _ in range(length - 1)))
    if honorific:
        out.insert(0, honorific)
    return " ".join(out)


def _tutor_shape(r: random.Random, real: str) -> str:
    honorific = real.split()[0]
    pool = ENGLISH_MALE if honorific == "Mr" else ENGLISH_FEMALE
    return f"{honorific} {r.choice(pool)} {r.choice(MACAU_SURNAMES)}"


def _phone_shape(r: random.Random, real: str) -> str:
    match = re.match(r"^(\+853|00853|853)?", real)
    prefix = match.group(0) if match else ""
    rest = real[len(prefix):]
    out = []
    kept_first = False
    for ch in rest:
        if ch.isdigit() and not kept_first:
            out.append(ch)
            kept_first = True
        elif ch.isdigit():
            out.append(str(r.randint(0, 9)))
        else:
            out.append(ch)
    return prefix + "".join(out)
