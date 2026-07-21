from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.models import User, Room
from app.schemas.schemas import RoomCreate, RoomResponse

router = APIRouter(prefix="/rooms", tags=["Rooms"])

@router.post("/", response_model=RoomResponse)
async def create_room(
    room_in: RoomCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Ensure current user is included in the new room
    target_usernames = set(room_in.participant_usernames)
    target_usernames.add(current_user.username)

    result = await db.execute(select(User).where(User.username.in_(target_usernames)))
    participants = result.scalars().all()

    if len(participants) != len(target_usernames):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="One or more target users do not exist"
        )

    room = Room(name=room_in.name, participants=participants)
    db.add(room)
    await db.commit()

    # Reload room with relationships
    stmt = (
        select(Room)
        .where(Room.id == room.id)
        .options(selectinload(Room.participants), selectinload(Room.messages))
    )
    res = await db.execute(stmt)
    return res.scalars().first()
