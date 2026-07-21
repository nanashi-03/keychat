import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import engine, Base
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
async def websocket_endpoint(websocket: WebSocket, username: str):
    await manager.connect(username, websocket)
    try:
        while True:
            # Maintain connection active
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(username, websocket)
