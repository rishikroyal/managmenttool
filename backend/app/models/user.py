from sqlalchemy import Column, Integer, String, ForeignKey

from app.database import Base


class User(Base):

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String, nullable=False)

    email = Column(
        String,
        unique=True,
        nullable=False
    )

    password = Column(String, nullable=False)

    # "manager" | "employee" | "admin"
    role = Column(String, nullable=False, default="employee")

    # For employees: the manager they report to (nullable)
    manager_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )