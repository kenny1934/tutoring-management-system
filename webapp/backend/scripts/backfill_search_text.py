"""One-time backfill: populate search_text for all existing documents."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import SessionLocal
from models import Document
from routers.documents import _extract_search_text


def main():
    db = SessionLocal()
    try:
        docs = db.query(Document).filter(
            (Document.search_text == None) | (Document.search_text == "")
        ).all()
        print(f"Backfilling {len(docs)} documents...")
        for i, doc in enumerate(docs):
            doc.search_text = _extract_search_text(doc.content)
            if (i + 1) % 100 == 0:
                db.commit()
                print(f"  ...{i + 1}/{len(docs)}")
        db.commit()
        print("Done.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
