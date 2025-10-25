FROM python:3.11-slim
WORKDIR /app
COPY watcher.py .
RUN pip install requests docker
CMD ["python", "watcher.py"]
