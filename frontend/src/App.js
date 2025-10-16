// frontend/src/App.js
import React, { useState, useEffect, useMemo } from "react";
import BondsPage from "./BondsPage";
import CouponsPage from "./CouponsPage";
import LogsPage from "./LogsPage";
import TradesPage from "./TradesPage";
import SummaryPanel from "./SummaryPanel";
import VolumePanel from "./VolumePanel";
import RGBIChart from "./RGBIChart";
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

  const loadCoupons = async () => {
    try {
      const res = await fetch("/coupons");
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      setCoupons(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Ошибка загрузки купонов", err);
    }
  };

  // Загружаем список облигаций
  const loadBonds = async () => {
      try {
        const res = await fetch("/bonds");
        if (!res.ok) throw new Error(res.statusText);
        const data = await res.json();
        setBonds([...data]); // 🔹 новый массив
      } catch (err) {
        console.error("Ошибка загрузки облигаций", err);
      }
    };
  // Загружаем позиции (сделки)
  const loadPositions = async () => {
      try {
        const res = await fetch("/positions");
        if (!res.ok) throw new Error(res.statusText);
        const data = await res.json();
        setPositions(data.map(p => ({ ...p }))); // 🔹 новые объекты
      } catch (err) {
        console.error("Ошибка загрузки позиций", err);
      }
    };

  const API_URL = process.env.REACT_APP_API_URL || "";

  useEffect(() => {
    loadBonds();
    loadPositions();
    fetch(`${API_URL}/logs`)
      .then(res => res.json())
      .then(setLogs)
      .catch(err => console.error("Ошибка загрузки логов", err));
    loadSummary();
  }, []);

  const addLog = async (msg) => {
    try {
      const res = await fetch(`${API_URL}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      if (!res.ok) throw new Error(res.statusText);
      const saved = await res.json();

      const logObj = {
        id: saved.id ?? Date.now(),
        timestamp: saved.timestamp ?? new Date().toISOString(),
        message: saved.message ?? msg,
      };

      setLogs(prev => [logObj, ...prev]); // 🔹 обновляем локальный список
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

  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState("");

  const handleDeleteSelected = async (ids) => {
    try {
      const res = await fetch("/bonds", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });

      if (!res.ok) {
        const errData = await res.json();
        setErrorModalMessage(errData.detail || "Ошибка удаления");
        setErrorModalOpen(true);
        return;
      }

      setBonds(prev => prev.filter(b => !ids.includes(b.id)));
      addLog(`Удалено ${ids.length} облигаций`);
    } catch (e) {
      console.error("DELETE /bonds failed", e);
      setErrorModalMessage("Ошибка удаления");
      setErrorModalOpen(true);
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

    const loadSummary = async () => {
      try {
        const res = await fetch("/api/portfolio_summary");
        if (!res.ok) throw new Error(res.statusText);
        const data = await res.json();
        setInvested(data.invested ?? 0);
        setTradesSum(data.trades_sum ?? 0);
        setCouponProfit(data.coupon_profit ?? 0);
        setCurrentValue(data.current_value ?? 0);
        setTotalValue(data.total_value ?? 0);
        setProfitPercent(data.profit_percent ?? 0);
      } catch (err) {
        console.error("Ошибка загрузки сводки", err);
      }
    };

  // объединяем данные (для структуры портфеля)
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
          <TradesPage addLog={addLog} loadSummary={loadSummary} loadBonds={loadBonds} loadPositions={loadPositions} loadCoupons={loadCoupons}/>
        </div>
        <div className="center-panel">
          <CouponsPage bonds={bonds} coupons={coupons} loadCoupons={loadCoupons}/>
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
        <div
          className="rgbi-backdrop"
        >
          <div
            className="rgbi-overlay"
            onClick={(e) => e.stopPropagation()} // клик внутри не закрывает
            onMouseLeave={() => setShowRGBI(false)}
          >
            <RGBIChart />
          </div>
        </div>
      )}

    </div>
  );
}