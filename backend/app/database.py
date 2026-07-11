import os
import aiosqlite
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from models import Base

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "memory.db")
SQLITE_URL = f"sqlite+aiosqlite:///{DB_PATH}"

_conn = None
_memory_saver = None

engine = create_async_engine(SQLITE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)
 
async def get_checkpointer():
    # sqlite database connection
    global _conn, _memory_saver
    if _memory_saver is None:
        _conn = await aiosqlite.connect(DB_PATH)
        _memory_saver = AsyncSqliteSaver(_conn)
    return _memory_saver

async def initialize_database():
    # langraph memory tables
    saver = await get_checkpointer()
    await saver.setup()
    
    # custom orm tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    print("database initialized")

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session