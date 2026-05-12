from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from app.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.task import Task
from app.models.project import Project
from app.models.member import ProjectMember

router = APIRouter(prefix="/admin", tags=["Admin"])


def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


# ── GET /admin/employees ──────────────────────────────────────────
# Returns all non-admin users (employees AND managers) so the admin
# panel has full visibility of every account.
@router.get("/employees")
def get_all_employees(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    users = db.query(User).filter(User.role != "admin").all()
    result = []
    for emp in users:
        tasks = db.query(Task).filter(Task.assigned_to == emp.id).all()
        manager = None
        if emp.manager_id:
            mgr = db.query(User).filter(User.id == emp.manager_id).first()
            if mgr:
                manager = {"id": mgr.id, "name": mgr.name, "email": mgr.email}
        result.append({
            "id": emp.id,
            "name": emp.name,
            "email": emp.email,
            "role": emp.role,
            "manager": manager,
            "tasks": [
                {"id": t.id, "title": t.title, "status": t.status,
                 "priority": t.priority, "due_date": t.due_date, "project_id": t.project_id}
                for t in tasks
            ],
        })
    return {"employees": result}


# ── GET /admin/managers ───────────────────────────────────────────
@router.get("/managers")
def get_all_managers(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    managers = db.query(User).filter(User.role == "manager").all()
    return {"managers": [{"id": m.id, "name": m.name, "email": m.email} for m in managers]}


# ── GET /admin/projects ───────────────────────────────────────────
@router.get("/projects")
def get_all_projects(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    projects = db.query(Project).all()
    return {"projects": [{"id": p.id, "name": p.name} for p in projects]}


# ── PATCH /admin/employees/{id}/manager ──────────────────────────
class AssignManagerPayload(BaseModel):
    manager_id: Optional[int] = None


@router.patch("/employees/{employee_id}/manager")
def assign_manager(
    employee_id: int,
    payload: AssignManagerPayload,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    employee = db.query(User).filter(User.id == employee_id, User.role == "employee").first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    if payload.manager_id is not None:
        manager = db.query(User).filter(User.id == payload.manager_id, User.role == "manager").first()
        if not manager:
            raise HTTPException(status_code=404, detail="Manager not found")
    employee.manager_id = payload.manager_id
    db.commit()
    return {"message": "Manager assigned successfully"}


# ── DELETE /admin/users/{user_id} ────────────────────────────────
@router.delete("/users/{user_id}")
def admin_delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == "admin":
        raise HTTPException(status_code=403, detail="Cannot delete admin accounts")

    uid = user.id
    # Cascade: delete tasks
    db.query(Task).filter((Task.assigned_to == uid) | (Task.created_by == uid)).delete()
    # Cascade: delete projects this user created (and their memberships/tasks)
    proj_ids = [p.id for p in db.query(Project).filter(Project.created_by == uid).all()]
    if proj_ids:
        db.query(Task).filter(Task.project_id.in_(proj_ids)).delete()
        db.query(ProjectMember).filter(ProjectMember.project_id.in_(proj_ids)).delete()
        db.query(Project).filter(Project.id.in_(proj_ids)).delete()
    # Remove memberships
    db.query(ProjectMember).filter(ProjectMember.user_id == uid).delete()
    # Unlink employees that report to this user
    db.query(User).filter(User.manager_id == uid).update({"manager_id": None})
    db.delete(user)
    db.commit()
    return {"message": "User deleted successfully"}


# ── DELETE /admin/tasks/{task_id} ────────────────────────────────
@router.delete("/tasks/{task_id}")
def admin_delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(task)
    db.commit()
    return {"message": "Task deleted successfully"}


# ── POST /admin/tasks ─────────────────────────────────────────────
# Admin can assign a task to ANY user with no membership restriction.
class AdminTaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "medium"
    due_date: Optional[datetime] = None
    project_id: int
    assigned_to: int


@router.post("/tasks")
def admin_create_task(
    payload: AdminTaskCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if not db.query(Project).filter(Project.id == payload.project_id).first():
        raise HTTPException(status_code=404, detail="Project not found")
    if not db.query(User).filter(User.id == payload.assigned_to).first():
        raise HTTPException(status_code=404, detail="User not found")

    task = Task(
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        due_date=payload.due_date,
        assigned_to=payload.assigned_to,
        project_id=payload.project_id,
        created_by=admin.id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return {"message": "Task assigned successfully", "task_id": task.id}


# ── GET /admin/suggest-member ─────────────────────────────────────
# Admin version: ranks ALL employees (optionally filtered to a project) using
# Groq based on their ongoing workload and past completed-task experience.

import os, json as _json
from groq import Groq as _Groq

@router.get("/suggest-member")
def admin_suggest_member(
    project_id: Optional[int] = None,
    task_title: str = "",
    task_description: str = "",
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if project_id:
        # Only employees who are members of the given project
        memberships = db.query(ProjectMember).filter(
            ProjectMember.project_id == project_id
        ).all()
        user_ids = [m.user_id for m in memberships]
        employees = db.query(User).filter(
            User.id.in_(user_ids), User.role == "employee"
        ).all()
    else:
        employees = db.query(User).filter(User.role == "employee").all()

    if not employees:
        raise HTTPException(status_code=404, detail="No employees found")

    members_data = []
    for emp in employees:
        all_tasks = db.query(Task).filter(Task.assigned_to == emp.id).all()
        ongoing   = [t for t in all_tasks if t.status in ("todo", "in_progress")]
        completed = [t for t in all_tasks if t.status == "done"]
        on_hold   = [t for t in all_tasks if t.status == "on_hold"]

        def fmt(lst):
            return [{"title": t.title, "priority": t.priority, "status": t.status} for t in lst]

        members_data.append({
            "id": emp.id,
            "name": emp.name,
            "ongoing_tasks": fmt(ongoing),
            "completed_tasks": fmt(completed),
            "on_hold_tasks": fmt(on_hold),
            "ongoing_count": len(ongoing),
            "completed_count": len(completed),
        })

    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key or api_key == "your_groq_api_key_here":
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not configured in .env")

    task_ctx = f"\nNew task to assign:\n  Title: {task_title}\n  Description: {task_description or 'N/A'}" if task_title else ""

    prompt = f"""You are a smart project management AI. Rank the following employees as candidates to receive the next assigned task.
{task_ctx}

Employee data (JSON):
{_json.dumps(members_data, indent=2)}

Rules:
1. Prefer employees with FEWER ongoing tasks (lower current load).
2. Prefer employees whose COMPLETED tasks show relevant experience.
3. Penalise employees with tasks on_hold (struggling).

Respond ONLY with valid JSON (no markdown):
{{
  "suggestions": [
    {{
      "user_id": <int>,
      "name": "<string>",
      "rank": <int starting at 1>,
      "score": <int 0-100>,
      "reason": "<one concise sentence>"
    }}
  ],
  "summary": "<one sentence overall recommendation>"
}}"""

    client = _Groq(api_key=api_key)
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=800,
    )

    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    try:
        result = _json.loads(raw)
    except _json.JSONDecodeError:
        result = {"suggestions": [], "summary": raw}

    return result
