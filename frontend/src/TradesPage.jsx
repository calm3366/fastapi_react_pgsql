// frontend/src/TradesPage.jsx
import React, { useState, useEffect } from "react";

export default function TradesPage({ addLog, loadSummary, loadBonds }) {
  const [trades, setTrades] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [tradeToDelete, setTradeToDelete] = useState(null);

  const handleAddTrade = async (tradeData) => {
    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tradeData),
      });
      if (!res.ok) throw new Error(res.statusText);

      await loadTrades();
      await loadSummary();
      await loadBonds();
      addLog(
        `Добавлена сделка по ${
          tradeData.bond_name || tradeData.bond?.name || tradeData.bond_id
        }`
      );
    } catch (err) {
      console.error("Ошибка добавления сделки", err);
      addLog("Ошибка добавления сделки");
    }
  };

  const loadTrades = async () => {
    try {
      const res = await fetch("/api/trades");
      if (!res.ok) throw new Error(res.statusText);
      setTrades(await res.json());
    } catch (err) {
      console.error("Ошибка загрузки сделок", err);
    }
  };

  const confirmDelete = async () => {
    if (!tradeToDelete) return;
    try {
      const res = await fetch(`/api/trades/${tradeToDelete.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        addLog("Ошибка удаления сделки");
        return;
      }

      await loadTrades();
      await loadSummary();
      addLog(`Удалена сделка по ${tradeToDelete.bond?.name ?? tradeToDelete.id}`);
    } catch (err) {
      console.error("Ошибка удаления сделки", err);
      addLog("Ошибка удаления сделки");
    } finally {
      setConfirmOpen(false);
      setTradeToDelete(null);
    }
  };

  const handleDeleteClick = (trade) => {
    setTradeToDelete(trade);
    setConfirmOpen(true);
  };

  useEffect(() => {
    loadTrades();
    const handler = () => loadTrades();
    window.addEventListener("trades-updated", handler);

    return () => {
      window.removeEventListener("trades-updated", handler);
    };
  }, []);

  const formatDate = (d) => (d ? new Date(d).toLocaleDateString("ru-RU") : "-");
  const formatNum = (n) => (n != null ? Number(n).toFixed(2) : "-");

  const calcTotal = (t) => {
    if (t.buy_date) {
      return formatNum(
        (t.buy_price ?? 0) * (t.buy_qty ?? 0) + (t.buy_nkd ?? 0)
      );
    } else {
      return formatNum(
        (t.sell_price ?? 0) * (t.sell_qty ?? 0) + (t.sell_nkd ?? 0)
      );
    }
  };

  return (
    <>
      <div className="panel-header">Последние сделки</div>
      <div className="trades-list" style={{ flex: 1, overflowY: "auto" }}>
        <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0 0" }}>
          {trades.length === 0 && <li>Нет данных</li>}
          {trades.map((t) => (
            <li
              key={t.id}
              style={{ marginBottom: 4, cursor: "pointer" }}
              onClick={() => handleDeleteClick(t)}
              title="Нажмите, чтобы удалить"
            >
              {t.buy_date ? (
                <>
                  [{formatDate(t.buy_date)}]🟢 Покупка{" "}
                  <strong>{t.bond?.name ?? "-"}</strong> на{" "}
                  <strong>{calcTotal(t)}</strong> = {formatNum(t.buy_price)} ×{" "}
                  {t.buy_qty ?? "-"} + {formatNum(t.buy_nkd ?? 0)}
                </>
              ) : (
                <>
                  [{formatDate(t.sell_date)}]🔴 Продажа{" "}
                  <strong>{t.bond?.name ?? "-"}</strong> на{" "}
                  <strong>{calcTotal(t)}</strong> = {formatNum(t.sell_price)} ×{" "}
                  {t.sell_qty ?? "-"} + {formatNum(t.sell_nkd ?? 0)}
                </>
              )}
            </li>
          ))}
        </ul>
      </div>

      {confirmOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: 20,
              borderRadius: 4,
              minWidth: 250,
            }}
          >
            <p>Удалить сделку?</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setConfirmOpen(false)}>Отмена</button>
              <button
                onClick={confirmDelete}
                style={{ background: "red", color: "#fff" }}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
