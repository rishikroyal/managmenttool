from fastapi import APIRouter
from fastapi import Depends

from sqlalchemy.orm import Session

from datetime import datetime

from app.database import get_db

from app.models.task import Task

from app.models.user import User

from app.core.dependencies import get_current_user


router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"]
)


@router.get("/stats")
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    tasks = db.query(Task).filter(
        (Task.assigned_to == current_user.id) |
        (Task.created_by == current_user.id)
    ).all()

    total_tasks = len(tasks)

    todo_tasks = len([
        task for task in tasks
        if task.status == "todo"
    ])

    in_progress_tasks = len([
        task for task in tasks
        if task.status == "in_progress"
    ])

    done_tasks = len([
        task for task in tasks
        if task.status == "done"
    ])

    overdue_tasks = len([
        task for task in tasks
        if task.due_date and
        task.due_date < datetime.utcnow() and
        task.status != "done"
    ])

    return {
        "total_tasks": total_tasks,
        "todo_tasks": todo_tasks,
        "in_progress_tasks": in_progress_tasks,
        "done_tasks": done_tasks,
        "overdue_tasks": overdue_tasks
    }

@router.get("/analytics")
def get_dashboard_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role == "admin":
        tasks = db.query(Task).all()
    elif current_user.role == "manager":
        tasks = db.query(Task).filter(
            (Task.assigned_to == current_user.id) |
            (Task.created_by == current_user.id)
        ).all()
    else:
        # employee
        tasks = db.query(Task).filter(
            Task.assigned_to == current_user.id
        ).all()

    # Aggregate by status
    status_counts = {"todo": 0, "in_progress": 0, "done": 0, "on_hold": 0}
    # Aggregate by priority
    priority_counts = {"low": 0, "medium": 0, "high": 0}

    for t in tasks:
        if t.status in status_counts:
            status_counts[t.status] += 1
        if t.priority in priority_counts:
            priority_counts[t.priority] += 1

    return {
        "status": status_counts,
        "priority": priority_counts
    }