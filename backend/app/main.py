from fastapi import FastAPI
from fastapi import Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import os

from app.database import Base, engine, get_db
from app.routers import auth, projects, tasks, dashboard, admin, notifications
from app.models.user import User
from app.models.project import Project
from app.models.member import ProjectMember
from app.models.task import Task
from app.models.notification import Notification
from app.core.dependencies import get_current_user
from fastapi.staticfiles import StaticFiles

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Project Management API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(dashboard.router)
app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(tasks.router)
app.include_router(admin.router)
app.include_router(notifications.router)

# Ensure uploads directory exists
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# --- API ENDPOINTS ---

@app.get("/me")
def get_me(current_user=Depends(get_current_user)):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "manager_id": current_user.manager_id,
    }

@app.get("/me/team")
def get_my_team(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "manager":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Only managers have a team")
    employees = db.query(User).filter(User.manager_id == current_user.id).all()
    return {
        "employees": [
            {"id": e.id, "name": e.name, "email": e.email}
            for e in employees
        ]
    }

# --- STATIC FILE SERVING (FRONTEND) ---
# We serve the frontend directory last so API routes take precedence.
# This logic checks multiple paths to ensure it works both locally and on Render.

base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
frontend_dir = os.path.join(base_dir, "frontend")

if not os.path.exists(frontend_dir):
    # Fallback for specific Render "Root Directory" configurations
    frontend_dir = os.path.join(os.getcwd(), "..", "frontend")

if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
    print(f"✅ Frontend mounted successfully from: {frontend_dir}")
else:
    print(f"⚠️ Warning: Frontend directory not found at {frontend_dir}")
