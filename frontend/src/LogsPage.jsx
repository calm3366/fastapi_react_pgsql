// frontend/src/LogsPage.jsx
import React from "react";

export default function LogsPage({ logs }) {
    return (
  <>
    <div
      className="panel-header header-appear"
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "0px 0" }}
    >
      <h3 className="heading-accent" style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.02 }}>Логи событий</h3>

    </div>

    <div className="logs-list compact-small" style={{ overflowY: "auto", paddingTop: 0 }}>
      {logs.length === 0 ? (
        <div style={{ color: "#888", padding: "0px 0px", lineHeight: 1.02 }}>Пока нет событий</div>
      ) : (
        logs
          .filter(log => !["Обновлены все облигации", "Ошибка обновления"].includes(log.message))
          .map((log) => (
            <div
              key={log.id}
              className="log-item"
              style={{ padding: "1px 1px", borderBottom: "1px solid #f0f0f0", fontSize: "0.82rem", color: "#333", lineHeight: 1.02 }}
              title={log.message}
            >
              <span style={{ color: "#6b7280", minWidth: 130, display: "inline-block", fontSize: "0.78rem" }}>
                {new Date(log.timestamp).toLocaleString("ru-RU")}
              </span>
              <span style={{ marginLeft: 8 }}>{log.message}</span>
            </div>
          ))
      )}
    </div>
  </>
);

}