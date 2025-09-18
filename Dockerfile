# Dockerfile
# ---------- Stage 1: Build frontend ----------
FROM node:18-alpine AS build-frontend
WORKDIR /frontend

# Кэшируем зависимости фронтенда
COPY frontend/package*.json ./
RUN npm install

# Копируем остальной код фронтенда
COPY frontend/ .
RUN npm run build


# ---------- Stage 2: Backend ----------
FROM python:3.10-slim
WORKDIR /app

# Кэшируем зависимости backend
COPY backend/requirements.txt .
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir gunicorn uvicorn psycopg2-binary alembic httpx

# Копируем код backend
COPY backend/app ./app
COPY backend/alembic.ini .
COPY backend/migrations ./migrations

# Переключение режима
ARG DEV_MODE=false
ENV DEV_MODE=${DEV_MODE}

# В продакшене копируем собранный фронт
RUN if [ "$DEV_MODE" = "false" ]; then mkdir -p app/static; fi
COPY --from=build-frontend /frontend/build ./app/static

EXPOSE 8000

# CMD ["/wait-for-db.sh", "db", "sh", "-c", "alembic upgrade head && gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w 4 -b 0.0.0.0:8000 --timeout 120"]
