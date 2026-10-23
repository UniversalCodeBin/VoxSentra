"""Create a user:  python scripts/create_user.py --username demo --password secret"""
import argparse
import getpass
import sys

sys.path.insert(0, ".")

from backend import models
from backend.database import SessionLocal, init_db
from backend.utils.security import hash_password


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--username", default="demo")
    ap.add_argument("--password", default=None)
    args = ap.parse_args()
    password = args.password or getpass.getpass("Password: ")
    if not password:
        print("password required", file=sys.stderr)
        sys.exit(1)
    init_db()
    db = SessionLocal()
    try:
        if db.query(models.User).filter(models.User.username == args.username).first():
            print(f"user '{args.username}' already exists")
            return
        db.add(models.User(username=args.username, password_hash=hash_password(password)))
        db.commit()
        print(f"created user '{args.username}'")
    finally:
        db.close()


if __name__ == "__main__":
    main()
