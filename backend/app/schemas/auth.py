from pydantic import BaseModel
from pydantic import EmailStr
from typing import Literal, Optional


class SignupSchema(BaseModel):
    name: str
    email: EmailStr
    password: str
    # Admin accounts are created separately; public signup only allows manager/employee
    role: Literal["manager", "employee"] = "employee"


class LoginSchema(BaseModel):
    email: EmailStr
    password: str