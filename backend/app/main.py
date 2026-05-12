from fastapi import FastAPI
from fastapi import Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.database import Base, engine, get_db
from app.routers import auth, projects, tasks, dashboard, admin
from app.models.user import User
from app.models.project import Project
from app.models.member import ProjectMember
from app.models.task import Task
from app.core.dependencies import get_current_user

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.routers import auth, projects, tasks, dashboard, admin, notifications
from app.models.notification import Notification
from fastapi.staticfiles import StaticFiles

app.include_router(dashboard.router)
app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(tasks.router)
app.include_router(admin.router)
app.include_router(notifications.router)

import os
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# (Mounting moved to the end of the file to ensure API routes take precedence)


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


# Serve frontend directory last so API routes are checked first
frontend_dir = os.path.join(os.path.dirname(__file__), "../../frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
