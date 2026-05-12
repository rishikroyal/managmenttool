from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import os
from groq import Groq

from app.database import get_db
from app.core.dependencies import get_current_user

from app.models.task import Task
from app.models.member import ProjectMember
from app.models.user import User
from app.models.notification import Notification

from app.schemas.task import TaskCreate, TaskStatusUpdate


router = APIRouter(
    prefix="/tasks",
    tags=["Tasks"]
)


def is_project_member(project_id: int, user_id: int, db: Session):

    return db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()


@router.post("/")
def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    member = is_project_member(
        payload.project_id,
        current_user.id,
        db
    )

    if not member:
        raise HTTPException(
            status_code=403,
            detail="You are not part of this project"
        )

    # Managers can only assign tasks to their own employees
    if current_user.role == "manager":
        assignee = db.query(User).filter(
            User.id == payload.assigned_to,
            User.manager_id == current_user.id
        ).first()
        if not assignee:
            raise HTTPException(
                status_code=403,
                detail="You can only assign tasks to employees under your management"
            )

    task = Task(
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        due_date=payload.due_date,
        assigned_to=payload.assigned_to,
        project_id=payload.project_id,
        created_by=current_user.id
    )

    db.add(task)
    db.commit()
    db.refresh(task)

    if task.assigned_to != current_user.id:
        notif = Notification(
            user_id=task.assigned_to,
            message=f"You have been assigned a new task: '{task.title}'"
        )
        db.add(notif)
        db.commit()

    return {
        "message": "Task created successfully",
        "task_id": task.id
    }

@router.get("/")
def get_my_tasks(
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

    query = db.query(Task).filter(
        (Task.assigned_to == current_user.id) |
        (Task.created_by == current_user.id)
    )

    total = query.count()

    tasks_db = query.offset(offset).limit(limit).all()
    tasks = []
    
    for t in tasks_db:
        assignee = db.query(User).filter(User.id == t.assigned_to).first()
        tasks.append({
            "id": t.id,
            "title": t.title,
            "description": t.description,
            "priority": t.priority,
            "status": t.status,
            "due_date": t.due_date,
            "project_id": t.project_id,
            "assigned_to": t.assigned_to,
            "created_by": t.created_by,
            "on_hold_reason": t.on_hold_reason,
            "completion_feedback": t.completion_feedback,
            "completion_file": t.completion_file,
            "assignee_name": assignee.name if assignee else "Unknown"
        })

    return {
        "page": page,
        "limit": limit,
        "total": total,
        "tasks": tasks
    }

@router.delete("/{task_id}")
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(Task).filter(
        Task.id == task_id
    ).first()

    if not task:
        raise HTTPException(
            status_code=404,
            detail="Task not found"
        )

    member = db.query(ProjectMember).filter(
        ProjectMember.project_id == task.project_id,
        ProjectMember.user_id == current_user.id
    ).first()

    if not member:
        raise HTTPException(
            status_code=403,
            detail="You are not part of this project"
        )

    if member.role != "admin" and task.created_by != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Only admin or task creator can delete this task"
        )

    db.delete(task)
    db.commit()

    return {
        "message": "Task deleted successfully"
    }
@router.patch("/{task_id}")
def update_task_status(
    task_id: int,
    payload: TaskStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    task = db.query(Task).filter(
        Task.id == task_id
    ).first()

    if not task:
        raise HTTPException(
            status_code=404,
            detail="Task not found"
        )

    if task.assigned_to != current_user.id and task.created_by != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You can update only your assigned tasks or tasks you created"
        )

    task.status = payload.status
    if payload.status == "on_hold":
        task.on_hold_reason = payload.on_hold_reason
        
        # Notify the manager (creator of task)
        notif = Notification(
            user_id=task.created_by,
            message=f"Task '{task.title}' was placed on hold by employee. Reason: {payload.on_hold_reason}"
        )
        db.add(notif)
    else:
        # If it was previously on_hold and now moved out, we might notify the employee (assignee) if the manager moved it
        if task.on_hold_reason and current_user.id != task.assigned_to:
            notif = Notification(
                user_id=task.assigned_to,
                message=f"Task '{task.title}' was reassigned or moved to {payload.status} by your manager."
            )
            db.add(notif)
        task.on_hold_reason = None

    db.commit()

    return {
        "message": "Task status updated successfully"
    }


from fastapi import File, UploadFile, Form
import shutil
import os
import uuid

@router.post("/{task_id}/complete")
def complete_task(
    task_id: int,
    feedback: str = Form(""),
    file: UploadFile = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    if task.assigned_to != current_user.id and task.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    task.status = "done"
    task.completion_feedback = feedback
    task.on_hold_reason = None
    
    if file and file.filename:
        filename = f"{uuid.uuid4()}_{file.filename}"
        file_path = os.path.join("uploads", filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        task.completion_file = file_path
        
    # Notify manager
    if task.assigned_to == current_user.id:
        notif = Notification(
            user_id=task.created_by,
            message=f"Task '{task.title}' was marked as Done. Feedback: {feedback[:50]}..."
        )
        db.add(notif)
        
    db.commit()
    return {"message": "Task completed successfully"}

# ── POST /tasks/{task_id}/analyse ─────────────────────────────────
# Uses Groq LLM to analyse the task and return actionable insights.

@router.post("/{task_id}/analyse")
def analyse_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Allow task assignee, their manager, or admin to analyse
    if (task.assigned_to != current_user.id
            and current_user.role not in ("manager", "admin")):
        raise HTTPException(status_code=403, detail="Not authorised to analyse this task")

    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key or api_key == "your_groq_api_key_here":
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not configured in .env")

    due_info = task.due_date.strftime("%Y-%m-%d %H:%M") if task.due_date else "No due date"

    prompt = f"""You are a project management assistant. Analyse the following task and give concise, actionable insights.

Task Title: {task.title}
Description: {task.description or "No description provided"}
Priority: {task.priority}
Status: {task.status}
Due: {due_info}

Respond in this exact JSON structure (no markdown, plain JSON only):
{{
  "summary": "One sentence summary of what this task involves.",
  "complexity": "Low | Medium | High",
  "risks": ["risk 1", "risk 2"],
  "action_steps": ["step 1", "step 2", "step 3"],
  "estimated_hours": <number>,
  "tips": "One practical tip to complete this task efficiently."
}}"""

    client = Groq(api_key=api_key)
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.4,
        max_tokens=600,
    )

    import json
    raw = response.choices[0].message.content.strip()
    # Strip markdown code fences if model adds them
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        analysis = json.loads(raw)
    except json.JSONDecodeError:
        analysis = {"raw": raw}

    return {"task_id": task_id, "analysis": analysis}