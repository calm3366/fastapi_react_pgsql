#!/usr/bin/env sh
# backend/dev-entrypoint.sh
set -e

# экспонируем PGDATABASE, чтобы pgsql не брало имя пользователя как БД
export PGDATABASE=${POSTGRES_DB}

until pg_isready -h db -p 5432 -U "$POSTGRES_USER"; do
  echo "⏳ Waiting for Postgres..."
  sleep 1
done

echo "🚀 Проверяем миграции..."
# Генерируем миграцию, если есть изменения в моделях
alembic revision --autogenerate -m "auto" || true

echo "📦 Применяем миграции..."
alembic upgrade head

echo "▶ Запускаем сервер..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload