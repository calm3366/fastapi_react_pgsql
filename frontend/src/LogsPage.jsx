// frontend/src/LogsPage.jsx
import React from "react";

export default function LogsPage({ logs }) {
    const loadLogs = async () => {
        try {
            const res = await fetch(`${API_URL}/logs`);
            if (!res.ok) throw new Error(res.statusText);
            setLogs(await res.json());
        } catch (e) {
            console.error("GET /logs failed", e);
        }
    };

    return (
        <>
            <div className="panel-header">Логи событий</div>
            <div className="logs-list">
                {logs.length === 0 && (
                    <div style={{ color: "#888" }}>Пока нет событий</div>
                )}
                {logs
                    .filter(log => !["Обновлены все облигации", "Ошибка обновления"].includes(log.message)) // 🔹 фильтруем
                    .map((log) => (
                    <div key={log.id} className="log-item">
                        {new Date(log.timestamp).toLocaleString("ru-RU")} — {log.message}
                    </div>
                    ))}
            </div>

        </>
    );
}