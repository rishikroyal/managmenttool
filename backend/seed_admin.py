"""
Run this once to create the admin account:
  python seed_admin.py

Make sure the venv is active first.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
from app.models.user import User
from app.core.security import hash_password

ADMIN_EMAIL    = "admin@company.com"
ADMIN_PASSWORD = "admin123"
ADMIN_NAME     = "Admin"

db = SessionLocal()

existing = db.query(User).filter(User.email == ADMIN_EMAIL).first()
if existing:
    print(f"Admin already exists: {ADMIN_EMAIL}")
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
