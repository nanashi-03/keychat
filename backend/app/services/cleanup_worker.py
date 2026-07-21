import asyncio
from datetime import datetime, timedelta, timezone
from sqlalchemy import delete
from app.core.database import AsyncSessionLocal
from app.models.models import EncryptedMessage
from app.core.config import settings

async def run_cleanup_loop():
    """Background task purging messages exceeding retention limits."""
    while True:
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.MESSAGE_RETENTION_HOURS)
            async with AsyncSessionLocal() as session:
                stmt = delete(EncryptedMessage).where(EncryptedMessage.created_at < cutoff)
                result = await session.execute(stmt)
                await session.commit()

                if len(result.all()) > 0:
                    print(f"[Cleanup Worker] Purged {len(result.all())} expired encrypted messages.")
        except Exception as e:
            print(f"[Cleanup Worker Error] {e}")

        # Run worker cycle every hour
        await asyncio.sleep(3600)
