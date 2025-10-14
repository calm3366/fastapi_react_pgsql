# backend/app/database.py
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

# создаём асинхронный движок
engine = create_async_engine(DATABASE_URL, echo=False, future=True)

# фабрика асинхронных сессий
async_session = sessionmaker(
    engine, expire_on_commit=False, class_=AsyncSession
)

Base = declarative_base()

# dependency для FastAPI
async def get_session() -> AsyncSession:
    async with async_session() as session:
        yield session