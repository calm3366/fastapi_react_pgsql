import os, datetime, requests, docker, sys

container_name = os.environ.get("CONTAINER_NAME", "backend")
n8n_webhook = os.environ.get("N8N_WEBHOOK")

client = docker.from_env()
container = client.containers.get(container_name)

buffer = []
collecting = False
MAX_LINES = 30
HEAD_LINES = 10
TAIL_LINES = 10

def compress_traceback(lines):
    total = len(lines)
    if total <= MAX_LINES:
        return lines
    head = lines[:HEAD_LINES]
    tail = lines[-TAIL_LINES:]
    return head + [f"... (обрезано {total - HEAD_LINES - TAIL_LINES} строк) ..."] + tail

def send_payload(lines):
    if not lines:
        return
    timestamp = datetime.datetime.now().isoformat()
    full_message = "\n".join(lines)

    # 🔹 логируем полный текст в stdout
    print(f"\n[{timestamp}] [{container_name}] Caught error:\n{full_message}\n", file=sys.stdout, flush=True)

    short_lines = compress_traceback(lines)
    short_message = "\n".join(short_lines)

    payload = {
        "error": short_message,
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
        if text.strip() == "" or text.startswith(("ERROR", "INFO", "WARNING")):
            send_payload(buffer)
            buffer = []
            collecting = False
