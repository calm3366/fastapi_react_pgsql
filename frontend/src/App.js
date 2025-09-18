// frontend/src/App.js
import React, { useState, useEffect } from "react";
import BondsPage from "./BondsPage";
import DynamicChart from "./DynamicChart";
import "./index.css";

export default function App() {
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState([]);
  const [bonds, setBonds]     = useState([]);
  const [lastUpdateTime, setLastUpdateTime] = useState(
    localStorage.getItem("lastUpdateTime") || null
  );
  const [logs, setLogs] = useState([]); // Логи событий

  // Функция загрузки облигаций
  const loadBonds = async () => {
    try {
      const res = await fetch("/bonds");
      if (!res.ok) throw new Error(res.statusText);
      setBonds(await res.json());
    } catch (e) {
      console.error("GET /bonds failed", e);
    }
  };
  
  const API_URL = process.env.REACT_APP_API_URL || "";
  // console.log("🔌 API_URL =", API_URL);

  const loadLogs = async () => {
    try {
      const res = await fetch(`${API_URL}/logs`);
      if (!res.ok) throw new Error(res.statusText);
      setLogs(await res.json());
    } catch (e) {
      console.error("GET /logs failed", e);
    }
  };


  useEffect(() => { 
    loadBonds();
    loadLogs();
  }, []);

  const addLog = async (msg) => {
    try {
      const res = await fetch(`${API_URL}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      if (!res.ok) throw new Error(res.statusText);
      const saved = await res.json(); // {status, id, timestamp?, message?}

      // Если бэк вернёт только id и status — подставим timestamp и message сами
      const logObj = {
        id: saved.id ?? Date.now(),
        timestamp: saved.timestamp ?? new Date().toISOString(),
        message: saved.message ?? msg,
      };

      setLogs(prev => [logObj, ...prev]);
    } catch (e) {
      console.error("POST /logs failed", e);
    }
  };


  const handleSearch = async () => {
    if (!query.trim()) return;
    try {
      const res = await fetch("/search_bonds?query=" + encodeURIComponent(query));
      if (!res.ok) throw new Error(res.statusText);
      setResults(await res.json());
      addLog(`Поиск: ${query}`);
    } catch (e) {
      console.error("GET /search_bonds failed", e);
      addLog("Ошибка поиска");
    }
  };

  const handleAdd = async (secid) => {
    try {
      const res = await fetch("/bonds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secid }),
      });
      if (!res.ok) throw new Error(res.statusText);

      await loadBonds();
      setResults([]);
      setQuery("");
      addLog(`Добавлена облигация ${secid}`);
    } catch (e) {
      console.error("POST /bonds failed", e);
      addLog(`Ошибка добавления ${secid}`);
    }
  };

  const handleDeleteSelected = async (ids) => {
    try {
      await fetch("/bonds", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      setBonds(prev => prev.filter(b => !ids.includes(b.id)));
      addLog(`Удалено ${ids.length} облигаций`);
    } catch (e) {
      console.error("DELETE /bonds failed", e);
      addLog("Ошибка удаления");
    }
  };

  const handleRefreshAll = async () => {
    try {
      const res = await fetch("/bonds", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [] }),
      });
      if (!res.ok) throw new Error(res.statusText);
      const updated = await res.json();
      setBonds(updated);

      const now = new Date().toISOString();
      setLastUpdateTime(now);
      localStorage.setItem("lastUpdateTime", now);
      addLog("Обновлены все облигации");
    } catch (e) {
      console.error("PUT /bonds failed", e);
      addLog("Ошибка обновления");
    }
  };

  return (
    <div className="dashboard">
      <div className="left-panel">
        <BondsPage
          query={query}
          setQuery={setQuery}
          results={results}
          bonds={bonds}
          onSearch={handleSearch}
          onAdd={handleAdd}
          onDeleteSelected={handleDeleteSelected}
          onRefreshAll={handleRefreshAll}
          lastUpdateTime={lastUpdateTime}
        />
      </div>
      <div className="right-panel">
        <div className="chart-wrapper">
          <DynamicChart bonds={bonds} />
        </div>
        <div className="logs-wrapper">
          <h3>Логи событий</h3>
          <div className="logs-list">
            {logs.length === 0 && <div style={{color:"#888"}}>Пока нет событий</div>}
            {logs.map((log) => (
              <div key={log.id} className="log-item">
                {new Date(log.timestamp).toLocaleString('ru-RU')} — {log.message}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}