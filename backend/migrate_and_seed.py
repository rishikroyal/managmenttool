"""
Run this ONCE to migrate the existing users table to add the new columns,
then create the admin account.

  venv\Scripts\python.exe migrate_and_seed.py
"""

import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from sqlalchemy import text
from app.database import engine, SessionLocal
from app.models.user import User
from app.core.security import hash_password

ADMIN_EMAIL    = "admin@company.com"
ADMIN_PASSWORD = "admin123"
ADMIN_NAME     = "Admin"

# ── 1. Add columns if missing ─────────────────────────────────────
with engine.connect() as conn:
    # Add role column
    try:
        conn.execute(text(
            "ALTER TABLE users ADD COLUMN role VARCHAR DEFAULT 'employee' NOT NULL"
        ))
        conn.commit()
        print("Added column: role")
    except Exception as e:
        conn.rollback()
        print(f"role column (skipping): {e}")

    # Add manager_id column
    try:
        conn.execute(text(
            "ALTER TABLE users ADD COLUMN manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL"
        ))
        conn.commit()
        print("Added column: manager_id")
    except Exception as e:
        conn.rollback()
        print(f"manager_id column (skipping): {e}")

# ── 2. Seed admin user ────────────────────────────────────────────
db = SessionLocal()
existing = db.query(User).filter(User.email == ADMIN_EMAIL).first()
if existing:
    # Make sure existing user has admin role
    existing.role = "admin"
    db.commit()
    print(f"Admin already exists, role set to admin: {ADMIN_EMAIL}")
else:
    admin = User(
        name=ADMIN_NAME,
        email=ADMIN_EMAIL,
        password=hash_password(ADMIN_PASSWORD),
        role="admin",
    )
    db.add(admin)
    db.commit()
    print(f"Admin created → email: {ADMIN_EMAIL}  password: {ADMIN_PASSWORD}")

db.close()
print("Done.")
