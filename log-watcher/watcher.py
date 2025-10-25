import os, datetime, requests, docker, sys

container_name = os.environ.get("CONTAINER_NAME", "fastapireactpgsql-backend-1")
n8n_webhook = os.environ.get("N8N_WEBHOOK")

client = docker.from_env()
container = client.containers.get(container_name)

buffer = []
collecting = False

def send_payload(lines):
    if not lines:
        return
    message = "\n".join(lines)
    timestamp = datetime.datetime.now().isoformat()

    # 🔹 логируем в stdout самого log-watcher
    print(f"[{timestamp}] [{container_name}] {message}", file=sys.stdout, flush=True)

    payload = {
        "error": message,
        "service": container_name,
        "timestamp": timestamp
    }
    try:
        requests.post(n8n_webhook, json=payload, timeout=2)
    except Exception as e:
        print(f"[{timestamp}] Ошибка отправки в n8n: {e}", file=sys.stderr, flush=True)

for raw in container.logs(stream=True, follow=True):
    text = raw.decode("utf-8").rstrip()

    if "Traceback" in text:
        collecting = True
        buffer = [text]
        continue

    if collecting:
        buffer.append(text)
        # конец блока: пустая строка или новая запись лога
        if text.strip() == "" or text.startswith(("ERROR", "INFO", "WARNING")):
            send_payload(buffer)
            buffer = []
            collecting = False
