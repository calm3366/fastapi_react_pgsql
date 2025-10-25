// frontend/src/App.js
import React, { useState, useEffect, useMemo } from "react";
import { apiFetch } from "./api";
import { useToastContext } from "./hooks";
import BondsPage from "./BondsPage";
import CouponsPage from "./CouponsPage";
import LogsPage from "./LogsPage";
import TradesPage from "./TradesPage";
import SummaryPanel from "./SummaryPanel";
import VolumePanel from "./VolumePanel";
import RGBIChart from "./RGBIChart";
import FxRatesPanel from "./FxRatesPanel";
import "./index.css";

export default function App() {
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState([]);
  const [bonds, setBonds]     = useState([]);
  const [lastUpdateTime, setLastUpdateTime] = useState(
    localStorage.getItem("lastUpdateTime") || null
  );
  const [logs, setLogs] = useState([]);
  const [invested, setInvested] = useState(0);
  const [tradesSum, setTradesSum] = useState(0);
  const [couponProfit, setCouponProfit] = useState(0);
  const [currentValue, setCurrentValue] = useState(0);
  const [totalValue, setTotalValue] = useState(0);
  const [profitPercent, setProfitPercent] = useState(0);
  const [positions, setPositions] = useState([]);
  const [showRGBI, setShowRGBI] = useState(false);
  const [coupons, setCoupons] = useState([]);
  const { showToast } = useToastContext();

  const loadCoupons = async () => {
    try {
      const data = await apiFetch("/coupons");
      setCoupons(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Ошибка загрузки купонов", err);
      showToast(err instanceof Error ? err.message : "Ошибка загрузки купонов", "error");
    }
  };

  // Загружаем список облигаций
  const loadBonds = async () => {
    try {
      const data = await apiFetch("/bonds");
      setBonds(Array.isArray(data) ? [...data] : []);
    } catch (err) {
      console.error("Ошибка загрузки облигаций", err);
      showToast(err instanceof Error ? err.message : "Ошибка загрузки облигаций", "error");
    }
  };

  // Загружаем позиции (сделки)
  const loadPositions = async () => {
    try {
      const data = await apiFetch("/positions");
      setPositions(Array.isArray(data) ? data.map(p => ({ ...p })) : []);
    } catch (err) {
      console.error("Ошибка загрузки позиций", err);
      showToast(err instanceof Error ? err.message : "Ошибка загрузки позиций", "error");
    }
  };

  useEffect(() => {
    (async () => {
      await Promise.all([loadBonds(), loadPositions(), loadCoupons()]);
      try {
        const logsData = await apiFetch("/logs");
        setLogs(Array.isArray(logsData) ? logsData : []);
      } catch (err) {
        console.error("Ошибка загрузки логов", err);
        showToast(err instanceof Error ? err.message : "Ошибка загрузки логов", "error");
      }
      await loadSummary();
    })();
    // пустой массив — запуск один раз при монтировании
  }, []);

  const addLog = async (msg) => {
    try {
      const saved = await apiFetch(`/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const logObj = {
        id: saved.id ?? Date.now(),
        timestamp: saved.timestamp ?? new Date().toISOString(),
        message: saved.message ?? msg,
      };
      setLogs(prev => [logObj, ...prev]);
    } catch (e) {
      console.error("POST /logs failed", e);
      showToast(e instanceof Error ? e.message : "Ошибка логирования", "error");
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    try {
      const data = await apiFetch("/search_bonds?query=" + encodeURIComponent(query));
      setResults(Array.isArray(data) ? data : []);
      addLog(`Поиск: ${query}`);
    } catch (e) {
      console.error("GET /search_bonds failed", e);
      addLog("Ошибка поиска");
    }
  };

  const handleAdd = async (secid) => {
    try {
      await apiFetch("/bonds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secid }),
      });
      await loadBonds();
      setResults([]);
      setQuery("");
      addLog(`Добавлена облигация ${secid}`);
    } catch (e) {
      console.error("POST /bonds failed", e);
      addLog(`Ошибка добавления ${secid}`);
    }
  };

  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState("");

  const handleDeleteSelected = async (ids) => {
      try {
        const res = await fetch("/bonds", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });

        if (res.ok) {
          // успешно
          setBonds(prev => prev.filter(b => !ids.includes(b.id)));
          addLog(`Удалено ${ids.length} облигаций`);
          return;
        }

        // если ошибка — попробуем прочитать тело и разобрать detail
        const contentType = res.headers.get("content-type") || "";
        let body = null;
        try {
          if (contentType.includes("application/json")) {
            body = await res.json();
          } else {
            const text = await res.text();
            // попробуем распарсить JSON из текста на случай, если сервер вернул JSON как строку
            try { body = JSON.parse(text); } catch { body = text; }
          }
        } catch (readErr) {
          body = null;
        }

        // Сформируем читаемое сообщение для пользователя
        let userMessage = `Ошибка ${res.status}`;
        if (body) {
          if (typeof body === "string") {
            userMessage = body;
          } else if (typeof body === "object") {
            if (typeof body.detail === "string") {
              userMessage = body.detail;
            } else if (typeof body.detail === "object") {
              userMessage = body.detail.message || JSON.stringify(body.detail);
              if (Array.isArray(body.detail.blocked) && body.detail.blocked.length) {
                const list = body.detail.blocked
                  .map(it => {
                    const id = it.bond_id ?? it.id ?? it[0];
                    const cnt = it.trades ?? it.cnt ?? it[1];
                    return `· id=${id}${typeof cnt !== "undefined" ? ` — ${cnt} сделок` : ""}`;
                  })
                  .join("\n");
                userMessage += "\n\nЗаблокировано для удаления:\n" + list;
              }
            } else if (body.message) {
              userMessage = body.message;
            } else {
              userMessage = JSON.stringify(body);
            }
          }
        } else {
          userMessage = `Ошибка ${res.status} при удалении`;
        }

        setErrorModalMessage(userMessage);
        setErrorModalOpen(true);

      } catch (e) {
        console.error("DELETE /bonds failed", e);
        setErrorModalMessage(e?.message || "Ошибка удаления");
        setErrorModalOpen(true);
      }
    };



  const handleRefreshAll = async () => {
    try {
      const updated = await apiFetch("/bonds", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [] }),
      });
      setBonds(Array.isArray(updated) ? updated : []);
      const now = new Date().toISOString();
      setLastUpdateTime(now);
      localStorage.setItem("lastUpdateTime", now);
      addLog("Обновлены все облигации");
    } catch (e) {
      console.error("PUT /bonds failed", e);
      addLog("Ошибка обновления");
    }
  };

  const loadSummary = async () => {
    try {
      const data = await apiFetch("/api/portfolio_summary");
      setInvested(data.invested ?? 0);
      setTradesSum(data.trades_sum ?? 0);
      setCouponProfit(data.coupon_profit ?? 0);
      setCurrentValue(data.current_value ?? 0);
      setTotalValue(data.total_value ?? 0);
      setProfitPercent(data.profit_percent ?? 0);
    } catch (err) {
      console.error("Ошибка загрузки сводки", err);
      showToast(err instanceof Error ? err.message : "Ошибка загрузки сводки", "error");
    }
  };

  const enrichedBonds = useMemo(() => {
    if (!bonds || !positions) return [];
    const qtyMap = positions.reduce((acc, p) => {
      acc[p.bond_id] = (acc[p.bond_id] ?? 0) + (p.buy_qty ?? 0);
      return acc;
    }, {});
    return bonds.map(b => ({
      ...b,
      buy_qty: qtyMap[b.id] ?? 0
    }));
  }, [bonds, positions]);

  return (
    <div className="dashboard">
      <FxRatesPanel />
      <div className="up-panel">
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
          addLog={addLog}
          loadSummary={loadSummary}
          onToggleRGBI={setShowRGBI}
          loadPositions={loadPositions}
          loadCoupons={loadCoupons}
          loadBonds={loadBonds}
        />
      </div>
      <VolumePanel bonds={enrichedBonds} />
      <SummaryPanel
        invested={invested}
        setInvested={setInvested}
        tradesSum={tradesSum}
        setTradesSum={setTradesSum}
        couponProfit={couponProfit}
        setCouponProfit={setCouponProfit}
        currentValue={currentValue}
        setCurrentValue={setCurrentValue}
        totalValue={totalValue}
        setTotalValue={setTotalValue}
        profitPercent={profitPercent}
        setProfitPercent={setProfitPercent}
      />
      <div className="bottom-panel">
        <div className="left-panel">
          <TradesPage addLog={addLog} loadSummary={loadSummary} loadBonds={loadBonds} loadPositions={loadPositions} loadCoupons={loadCoupons} />
        </div>
        <div className="center-panel">
          <CouponsPage bonds={bonds} coupons={coupons} loadCoupons={loadCoupons} />
        </div>
        <div className="logs-wrapper">
          <LogsPage logs={logs} />
        </div>
      </div>

      {errorModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            background: '#fff',
            padding: 20,
            borderRadius: 4,
            minWidth: 250
          }}>
            <p>{errorModalMessage}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setErrorModalOpen(false)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {showRGBI && (
        <div className="rgbi-backdrop">
          <div
            className="rgbi-overlay"
            onClick={(e) => e.stopPropagation()}
            onMouseLeave={() => setShowRGBI(false)}
          >
            <RGBIChart />
          </div>
        </div>
      )}
    </div>
  );
}
