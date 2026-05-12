from pydantic import BaseModel, Field
from typing import Optional


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=3, max_length=100)
    description: Optional[str] = Field(None, max_length=500)


class AddMemberSchema(BaseModel):
    user_id: int
    role: str = Field(default="member", pattern="^(admin|member)$")