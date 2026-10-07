"""Sign in to the local app as a tutor, without going through Google.

This prints a sign-in token for one tutor, made with the same function the
real Google sign-in uses, so the local frontend treats it exactly like a
normal session. It exists so that you (or Claude) can open real screens on
your own machine, for example to take screenshots with
`webapp/frontend/scripts/screens.mjs`. Usage from the backend dir:

    ./venv/bin/python scripts/dev_signin.py 5                  # by tutor id
    ./venv/bin/python scripts/dev_signin.py kenny.chiu@...     # by email
    ./venv/bin/python scripts/dev_signin.py "Kenny" --hours 2  # by name

It only prints the token. To use it in a browser, set it as the
`access_token` cookie on localhost.

It's a command rather than a web endpoint on purpose. An endpoint that only
switches on in development becomes a back door the day ENVIRONMENT is wrong
in production. This command needs the signing key from `.env`, and anyone
with that key can already make any token they like, so it opens nothing new.
For the same reason, the local `.env` should have its own JWT_SECRET_KEY,
different from production's, so a token made here only works here.
"""

import argparse
import os
import sys
from datetime import timedelta

# Allow running from the backend directory.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# database loads .env, which has to happen before jwt_handler reads the key.
from database import SessionLocal  # noqa: E402
from models import Tutor  # noqa: E402
from auth.jwt_handler import create_access_token  # noqa: E402

MAX_HOURS = 8


def find_tutor(db, who: str):
    """Look a tutor up by id, then by exact email, then by part of the name."""
    if who.isdigit():
        return db.query(Tutor).filter(Tutor.id == int(who)).all()
    by_email = db.query(Tutor).filter(Tutor.user_email == who).all()
    if by_email:
        return by_email
    return db.query(Tutor).filter(Tutor.tutor_name.ilike(f"%{who}%")).all()


def main() -> int:
    parser = argparse.ArgumentParser(description="Print a local sign-in token for a tutor.")
    parser.add_argument("tutor", help="tutor id, email, or part of the name")
    parser.add_argument("--hours", type=float, default=1, help=f"how long the token lasts (default 1, at most {MAX_HOURS})")
    args = parser.parse_args()

    environment = os.getenv("ENVIRONMENT", "development")
    if environment != "development":
        print(f"Refusing: ENVIRONMENT is {environment!r}. This only runs against a development backend.", file=sys.stderr)
        return 1
    if not 0 < args.hours <= MAX_HOURS:
        print(f"Refusing: --hours has to be more than 0 and at most {MAX_HOURS}.", file=sys.stderr)
        return 1

    db = SessionLocal()
    try:
        matches = find_tutor(db, args.tutor)
        if not matches:
            print(f"No tutor matches {args.tutor!r}.", file=sys.stderr)
            return 1
        if len(matches) > 1:
            print(f"{args.tutor!r} matches more than one tutor, so give the id instead:", file=sys.stderr)
            for t in matches:
                print(f"  {t.id}  {t.tutor_name}  ({t.role}, {t.user_email})", file=sys.stderr)
            return 1
        tutor = matches[0]
        # The same claims the Google callback in routers/auth.py puts in.
        token = create_access_token(
            {
                "sub": str(tutor.id),
                "email": tutor.user_email,
                "name": tutor.tutor_name,
                "role": tutor.role,
                "picture": getattr(tutor, "profile_picture", None),
            },
            expires_delta=timedelta(hours=args.hours),
        )
    finally:
        db.close()

    print(f"Signed in as {tutor.tutor_name} ({tutor.role}) for {args.hours:g} hour(s).", file=sys.stderr)
    print(token)
    return 0


if __name__ == "__main__":
    sys.exit(main())
