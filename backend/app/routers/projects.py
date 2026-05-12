from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import os
import json
from groq import Groq

from app.database import get_db
from app.core.dependencies import get_current_user

from app.models.project import Project
from app.models.member import ProjectMember
from app.models.user import User
from app.models.task import Task

from app.schemas.project import ProjectCreate, AddMemberSchema


router = APIRouter(
    prefix="/projects",
    tags=["Projects"]
)


def check_project_admin(project_id: int, user_id: int, db: Session):
    member = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id,
        ProjectMember.role == "admin"
    ).first()

    return member is not None


@router.post("/")
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = Project(
        name=payload.name,
        description=payload.description,
        created_by=current_user.id
    )

    db.add(project)
    db.commit()
    db.refresh(project)

    admin_member = ProjectMember(
        project_id=project.id,
        user_id=current_user.id,
        role="admin"
    )

    db.add(admin_member)
    db.commit()

    return {
        "message": "Project created successfully",
        "project": {
            "id": project.id,
            "name": project.name,
            "description": project.description,
            "created_by": project.created_by
        }
    }

@router.get("/")
def get_my_projects(
    page: int = 1,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if page < 1:
        page = 1

    if limit < 1:
        limit = 10

    if limit > 50:
        limit = 50

    offset = (page - 1) * limit

    query = db.query(ProjectMember).filter(
        ProjectMember.user_id == current_user.id
    )

    total = query.count()

    memberships = query.offset(offset).limit(limit).all()

    result = []

    for membership in memberships:

        project = db.query(Project).filter(
            Project.id == membership.project_id
        ).first()

        if project:

            result.append({
                "id": project.id,
                "name": project.name,
                "description": project.description,
                "role": membership.role
            })

    return {
        "page": page,
        "limit": limit,
        "total": total,
        "projects": result
    }
@router.post("/{project_id}/members")
def add_member(
    project_id: int,
    payload: AddMemberSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    is_admin = check_project_admin(
        project_id,
        current_user.id,
        db
    )

    if not is_admin:
        raise HTTPException(
            status_code=403,
            detail="Only project admin can add members"
        )

    user = db.query(User).filter(
        User.id == payload.user_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    existing_member = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == payload.user_id
    ).first()

    if existing_member:
        raise HTTPException(
            status_code=400,
            detail="User already in project"
        )

    member = ProjectMember(
        project_id=project_id,
        user_id=payload.user_id,
        role=payload.role
    )

    db.add(member)
    db.commit()

    return {
        "message": "Member added successfully"
    }

@router.delete("/{project_id}/members/{user_id}")
def remove_member(
    project_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    is_admin = check_project_admin(project_id, current_user.id, db)
    
    # You can't remove yourself unless you're destroying the project (not implemented), 
    # but any admin can remove an employee.
    if not is_admin:
        raise HTTPException(
            status_code=403,
            detail="Only project admin can remove members"
        )
        
    member = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()
    
    if not member:
        raise HTTPException(
            status_code=404,
            detail="User is not a member of this project"
        )
        
    db.delete(member)
    db.commit()
    
    return {
        "message": "Member removed successfully"
    }


# ── GET /projects/{project_id}/suggest-member ─────────────────────────────
# Uses Groq LLM to analyse every member's workload + task history and rank
# them as candidates for the next task in this project.

@router.get("/{project_id}/suggest-member")
def suggest_member(
    project_id: int,
    task_title: str = "",
    task_description: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Caller must be a project admin OR a global admin/manager
    if current_user.role not in ("admin", "manager"):
        # Check project-level admin
        is_proj_admin = check_project_admin(project_id, current_user.id, db)
        if not is_proj_admin:
            raise HTTPException(status_code=403, detail="Not authorised to get suggestions")

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Collect members
    memberships = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id
    ).all()

    if not memberships:
        raise HTTPException(status_code=404, detail="No members in this project")

    members_data = []
    for ms in memberships:
        user = db.query(User).filter(User.id == ms.user_id).first()
        if not user or user.role == "admin":
            continue

        all_tasks = db.query(Task).filter(Task.assigned_to == user.id).all()
        ongoing   = [t for t in all_tasks if t.status in ("todo", "in_progress")]
        completed = [t for t in all_tasks if t.status == "done"]
        on_hold   = [t for t in all_tasks if t.status == "on_hold"]

        def fmt_tasks(lst):
            return [{"title": t.title, "priority": t.priority,
                     "status": t.status, "project_id": t.project_id} for t in lst]

        members_data.append({
            "id": user.id,
            "name": user.name,
            "role": user.role,
            "ongoing_tasks": fmt_tasks(ongoing),
            "completed_tasks": fmt_tasks(completed),
            "on_hold_tasks": fmt_tasks(on_hold),
            "ongoing_count": len(ongoing),
            "completed_count": len(completed),
        })

    if not members_data:
        raise HTTPException(status_code=404, detail="No eligible members found")

    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key or api_key == "your_groq_api_key_here":
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not configured in .env")

    task_context = ""
    if task_title:
        task_context = f"\nNew task to assign:\n  Title: {task_title}\n  Description: {task_description or 'N/A'}"

    prompt = f"""You are a smart project management AI. Based on each team member's current workload and past work experience, rank them as candidates to be assigned the next task.

Project: {project.name}
{task_context}

Team members data (JSON):
{json.dumps(members_data, indent=2)}

Rules:
1. Prefer members with FEWER ongoing tasks (lower current load).
2. Prefer members whose COMPLETED tasks show relevant experience.
3. Penalise members with tasks on_hold (struggling).
4. Provide a short, specific reason for each ranking decision.

Respond ONLY with valid JSON in this exact structure (no markdown, no extra text):
{{
  "suggestions": [
    {{
      "user_id": <int>,
      "name": "<string>",
      "rank": <int starting at 1>,
      "score": <int 0-100>,
      "reason": "<one concise sentence explaining why this person is best/worst fit>"
    }}
  ],
  "summary": "<one sentence overall recommendation>"
}}"""

    client = Groq(api_key=api_key)
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
        result = json.loads(raw)
    except json.JSONDecodeError:
        result = {"suggestions": [], "summary": raw}

    return {"project_id": project_id, **result}