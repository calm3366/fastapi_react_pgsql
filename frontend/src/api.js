// src/api.js
const API_URL = process.env.REACT_APP_API_URL  ?? "/";

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, options);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ошибка ${res.status}: ${text}`);
  }
  return res.json();
}

// отдельный helper для внешних API
export async function externalFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ошибка внешнего запроса ${url}: ${res.status} ${text}`);
  }
  return res.json();
}