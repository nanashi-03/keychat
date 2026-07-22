import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import engine, Base, AsyncSessionLocal
from app.models.models import User
from app.websockets.redis_bridge import manager
from app.services.cleanup_worker import run_cleanup_loop
from app.api import auth, rooms, messages

@asynccontextmanager
async def lifespan(app: FastAPI):
    # System startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await manager.initialize()
    cleanup_task = asyncio.create_task(run_cleanup_loop())
    yield
    # System shutdown
    cleanup_task.cancel()

app = FastAPI(title=settings.PROJECT_NAME, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Route aggregations
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(rooms.router, prefix=settings.API_V1_STR)
app.include_router(messages.router, prefix=settings.API_V1_STR)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, username: str = Query(...)):
    # Fetch user's active rooms on socket establishment to register room channels
    async with AsyncSessionLocal() as session:
        stmt = (
            select(User)
            .where(User.username == username)
            .options(selectinload(User.rooms))
        )
        res = await session.execute(stmt)
        user = res.scalars().first()

        if not user:
            await websocket.close(code=4001)
            return

        user_room_ids = [str(room.id) for room in user.rooms]

    await manager.connect(username, user_room_ids, websocket)

    try:
        while True:
            # Maintain connection active
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(username, user_room_ids, websocket)
