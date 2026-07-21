from pydantic import BaseModel, EmailStr, ConfigDict
from typing import List, Optional
from datetime import datetime
from uuid import UUID

# User Schemas
class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: UUID
    username: str
    email: str
    model_config = ConfigDict(from_attributes=True)

# Token Schemas
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

# Encrypted Message Schemas
class MessageCreate(BaseModel):
    room_id: UUID
    cipher_blob: str
    nonce: str

class MessageResponse(BaseModel):
    id: UUID
    room_id: UUID
    sender_username: str
    cipher_blob: str
    nonce: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

# Room Schemas
class RoomCreate(BaseModel):
    name: str
    participant_usernames: List[str]

class RoomResponse(BaseModel):
    id: UUID
    name: str
    participants: List[UserResponse]
    messages: List[MessageResponse] = []
    model_config = ConfigDict(from_attributes=True)

# On-Login Sync Schema
class LoginSyncResponse(BaseModel):
    user: UserResponse
    token: Token
    rooms: List[RoomResponse]
