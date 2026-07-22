# backend/app/websockets/redis_bridge.py
import json
import asyncio
from typing import Dict, Set
from fastapi import WebSocket
import redis.asyncio as aioredis
from app.core.config import settings

class ConnectionManager:
    def __init__(self):
        # Maps username -> Set of active WebSocket connections
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        # Maps room_id (str) -> Set of usernames active on this specific backend node
        self.room_user_map: Dict[str, Set[str]] = {}
        # Reference counts for active room connections on this node
        self.room_ref_counts: Dict[str, int] = {}

        self.redis: aioredis.Redis = None
        self.pubsub = None
        self._listen_task = None

    async def initialize(self):
        self.redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        self.pubsub = self.redis.pubsub()
        self._listen_task = asyncio.create_task(self._listen_to_redis())

    async def connect(self, username: str, room_ids: list[str], websocket: WebSocket):
        await websocket.accept()
        if username not in self.active_connections:
            self.active_connections[username] = set()
        self.active_connections[username].add(websocket)

        # Register room subscriptions for this connected socket
        for r_id in room_ids:
            room_str = str(r_id)
            if room_str not in self.room_user_map:
                self.room_user_map[room_str] = set()
                self.room_ref_counts[room_str] = 0

            self.room_user_map[room_str].add(username)
            self.room_ref_counts[room_str] += 1

            # Dynamic Redis Subscription
            if self.room_ref_counts[room_str] == 1:
                await self.pubsub.subscribe(f"room:{room_str}")

    async def disconnect(self, username: str, room_ids: list[str], websocket: WebSocket):
        if username in self.active_connections:
            self.active_connections[username].discard(websocket)
            if not self.active_connections[username]:
                del self.active_connections[username]

        for r_id in room_ids:
            room_str = str(r_id)
            if room_str in self.room_ref_counts:
                self.room_ref_counts[room_str] -= 1

                if self.room_ref_counts[room_str] <= 0:
                    del self.room_ref_counts[room_str]
                    if room_str in self.room_user_map:
                        del self.room_user_map[room_str]
                    await self.pubsub.unsubscribe(f"room:{room_str}")

    async def publish_to_room(self, room_id: str, payload: dict):
        channel = f"room:{room_id}"
        await self.redis.publish(channel, json.dumps(payload))

    async def _listen_to_redis(self):
        """Polling listener loop that handles dynamic subscriptions gracefully."""
        while True:
            try:
                message = await self.pubsub.get_message(
                    ignore_subscribe_messages=True,
                    timeout=1.0
                )
                if message and message["type"] == "message":
                    channel: str = message["channel"]
                    if channel.startswith("room:"):
                        room_id = channel.split("room:")[1]
                        payload = json.loads(message["data"])

                        local_users = self.room_user_map.get(room_id, set())
                        for target_user in list(local_users):
                            if target_user in self.active_connections:
                                dead_sockets = set()
                                for ws in self.active_connections[target_user]:
                                    try:
                                        await ws.send_json(payload)
                                    except Exception:
                                        dead_sockets.add(ws)
                                self.active_connections[target_user] -= dead_sockets
            except asyncio.CancelledError:
                break
            except Exception as e:
                await asyncio.sleep(0.5)

manager = ConnectionManager()
