import json
import asyncio
from typing import Dict, Set, Optional
from fastapi import WebSocket
import redis.asyncio as aioredis
from app.core.config import settings

class ConnectionManager:
    def __init__(self):
        # Maps username -> Set of active WebSocket connections (multi-tab/device support)
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self.redis: Optional[aioredis.Redis] = None
        self.pubsub = None

    async def initialize(self):
        self.redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        self.pubsub = self.redis.pubsub()
        await self.pubsub.subscribe("keychat_global_channel")
        asyncio.create_task(self._listen_to_redis())

    async def connect(self, username: str, websocket: WebSocket):
        await websocket.accept()
        if username not in self.active_connections:
            self.active_connections[username] = set()
        self.active_connections[username].add(websocket)

    def disconnect(self, username: str, websocket: WebSocket):
        if username in self.active_connections:
            self.active_connections[username].discard(websocket)
            if not self.active_connections[username]:
                del self.active_connections[username]

    async def publish_message(self, target_usernames: list[str], payload: dict):
        """Publish payload via Redis to reach active users across nodes."""
        message_data = {
            "targets": target_usernames,
            "payload": payload
        }
        assert self.redis is not None
        await self.redis.publish("keychat_global_channel", json.dumps(message_data))

    async def _listen_to_redis(self):
        """Worker task reading from Redis Pub/Sub and pushing to client sockets."""
        assert self.pubsub is not None
        async for message in self.pubsub.listen():
            if message["type"] == "message":
                data = json.loads(message["data"])
                targets = data.get("targets", [])
                payload = data.get("payload", {})

                for target_user in targets:
                    if target_user in self.active_connections:
                        dead_sockets = set()
                        for ws in self.active_connections[target_user]:
                            try:
                                await ws.send_json(payload)
                            except Exception:
                                dead_sockets.add(ws)
                        self.active_connections[target_user] -= dead_sockets

manager = ConnectionManager()
