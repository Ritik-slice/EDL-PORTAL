from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: str = "underwriter"


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    is_active: bool

    model_config = {"from_attributes": True}
