from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.config import get_settings

settings = get_settings()

_client: AsyncIOMotorClient | None = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(settings.mongo_url)
    return _client


def get_db() -> AsyncIOMotorDatabase:
    return get_client()[settings.mongo_db]


async def close_db():
    global _client
    if _client:
        _client.close()
        _client = None


async def create_indexes():
    """Create MongoDB indexes on startup."""
    db = get_db()
    await db.users.create_index("email", unique=True)
    await db.reports.create_index("user_id")
    await db.reports.create_index([("user_id", 1), ("created_at", -1)])
