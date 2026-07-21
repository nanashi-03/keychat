from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.models import User, Room, EncryptedMessage
from app.schemas.schemas import MessageCreate, MessageResponse
from app.websockets.redis_bridge import manager

router = APIRouter(prefix="/messages", tags=["Messages"])

@router.post("/", response_model=MessageResponse)
async def send_message(
    msg_in: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = (
        select(Room)
        .where(Room.id == msg_in.room_id)
        .options(selectinload(Room.participants))
    )
    result = await db.execute(stmt)
    room = result.scalars().first()

    if not room or current_user not in room.participants:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not a member of this room"
        )

    db_msg = EncryptedMessage(
        room_id=msg_in.room_id,
        sender_username=current_user.username,
        cipher_blob=msg_in.cipher_blob,
        nonce=msg_in.nonce
    )
    db.add(db_msg)
    await db.commit()
    await db.refresh(db_msg)

    # Format real-time payload
    payload = {
        "id": str(db_msg.id),
        "room_id": str(db_msg.room_id),
        "sender_username": db_msg.sender_username,
        "cipher_blob": db_msg.cipher_blob,
        "nonce": db_msg.nonce,
        "created_at": db_msg.created_at.isoformat()
    }

    # Broadcast via Redis Pub/Sub to all members of the target room
    participant_usernames = [p.username for p in room.participants]
    await manager.publish_message(participant_usernames, payload)

    return db_msg
