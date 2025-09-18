from logging.config import fileConfig
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context
import os, sys, asyncio

sys.path.append('/app')
from app import models
from app.database import Base

config = context.config

url = os.getenv("DATABASE_URL")
if url:
    config.set_main_option("sqlalchemy.url", url)

target_metadata = Base.metadata

def run_migrations_offline():
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()

async def run_migrations_online():
    connectable = create_async_engine(url, future=True)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()

asyncio.run(run_migrations_online())

if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
