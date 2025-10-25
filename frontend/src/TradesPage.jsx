// frontend/src/TradesPage.jsx
import React, { useState, useEffect } from "react";
import { apiFetch } from "./api";

export default function TradesPage({ addLog, loadSummary, loadBonds, loadPositions, loadCoupons }) {
  const [trades, setTrades] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [tradeToDelete, setTradeToDelete] = useState(null);

  const formatDate = (d) => (d ? new Date(d).toLocaleDateString("ru-RU") : "-");
  const formatNum = (n) => (n != null && isFinite(Number(n)) ? Number(n).toFixed(2) : "-");

  const formatCurrency = (amount, symbol, code) => {
    if (amount == null || !isFinite(Number(amount))) return "-";
    const formatted = Number(amount).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (symbol) return `${formatted} ${symbol}`;
    if (code) return `${formatted} ${code}`;
    return `${formatted}`;
  };

  const toRub = (amount, fx_rate, currency) => {
    if (amount == null || !isFinite(Number(amount))) return null;
    if (!currency || currency.toUpperCase() === "SUR" || currency.toUpperCase() === "RUB") return Number(amount);
    if (fx_rate != null && isFinite(Number(fx_rate)) && Number(fx_rate) !== 0) {
      return Number(amount) * Number(fx_rate);
    }
    return null;
  };

  const loadTrades = async () => {
    try {
      const data = await apiFetch("/api/trades");
      setTrades(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Ошибка загрузки сделок", err);
      setTrades([]);
    }
  };

  useEffect(() => {
    loadTrades();
    const handler = () => loadTrades();
    window.addEventListener("trades-updated", handler);
    return () => window.removeEventListener("trades-updated", handler);
  }, []);

  const handleAddTrade = async (tradeData) => {
    try {
      await apiFetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tradeData),
      });

      await loadTrades();

      if (typeof loadSummary === "function") {
        try { await loadSummary(); } catch (e) { console.warn("loadSummary failed", e); }
      }
      if (typeof loadBonds === "function") {
        try { await loadBonds(); } catch (e) { console.warn("loadBonds failed", e); }
      }
      if (typeof loadPositions === "function") {
        try { await loadPositions(); } catch (e) { console.warn("loadPositions failed", e); }
      }

      addLog(`Добавлена сделка по ${tradeData.bond_name || tradeData.bond?.name || tradeData.bond_id}`);

      try { window.dispatchEvent(new CustomEvent("trades-updated", { detail: { source: "tradesPage", action: "add" } })); } catch (e) {}
      try { window.dispatchEvent(new CustomEvent("bonds-updated", { detail: { source: "tradesPage", action: "add" } })); } catch (e) {}
    } catch (err) {
      console.error("Ошибка добавления сделки", err);
      addLog("Ошибка добавления сделки");
    }
  };

  const confirmDelete = async () => {
    if (!tradeToDelete) return;
    try {
      await apiFetch(`/api/trades/${tradeToDelete.id}`, {
        method: "DELETE",
      });

      await loadTrades();

      if (typeof loadSummary === "function") {
        try { await loadSummary(); } catch (e) { console.warn("loadSummary failed", e); }
      }
      if (typeof loadBonds === "function") {
        try { await loadBonds(); } catch (e) { console.warn("loadBonds failed", e); }
      }
      if (typeof loadPositions === "function") {
        try { await loadPositions(); } catch (e) { console.warn("loadPositions failed", e); }
      }
      if (typeof loadCoupons === "function") {
        try { await loadCoupons(); } catch (e) { console.warn("loadCoupons failed", e); }
      }

      addLog(`Удалена сделка по ${tradeToDelete.bond?.name ?? tradeToDelete.id}`);

      try { window.dispatchEvent(new CustomEvent("trades-updated", { detail: { source: "tradesPage", action: "delete", id: tradeToDelete.id } })); } catch (e) {}
      try { window.dispatchEvent(new CustomEvent("bonds-updated", { detail: { source: "tradesPage", action: "delete", id: tradeToDelete.id } })); } catch (e) {}
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

  const renderTradeLine = (t) => {
    let currency = (t.currency || t.bond?.currency) ?? null;
    currency = (currency || "SUR").toString().toUpperCase();

    const currencySymbols = {
      RUB: "₽",
      SUR: "₽",
      USD: "$",
      CNY: "¥",
      EUR: "€"
    };

    const symbol = t.currency_symbol ?? currencySymbols[currency] ?? currency;

    const price = t.buy_date ? t.buy_price : t.sell_price;
    const qty = t.buy_date ? t.buy_qty : t.sell_qty;
    const nkd = t.buy_date ? (t.buy_nkd ?? 0) : (t.sell_nkd ?? 0);

    const priceNum = isFinite(Number(price)) ? Number(price) : null;
    const qtyNum = isFinite(Number(qty)) ? Number(qty) : null;
    const nkdNum = isFinite(Number(nkd)) ? Number(nkd) : 0;

    const commission = isFinite(Number(t.buy_commission ?? t.sell_commission ?? null))
      ? Number(t.buy_commission ?? t.sell_commission)
      : null;
    const fx_rate = (t.fx_rate != null && isFinite(Number(t.fx_rate))) ? Number(t.fx_rate) : null;

    const priceQtyStr = (priceNum != null && qtyNum != null) ? `${formatNum(priceNum)} × ${qtyNum}` : null;
    const nkdStr = `${formatNum(nkdNum)}`;

    const tradeAmount = (t.total_amount != null && isFinite(Number(t.total_amount)))
      ? Number(t.total_amount)
      : (priceNum != null && qtyNum != null ? priceNum * qtyNum + (nkdNum || 0) : null);

    const tradeAmountWithComm = (tradeAmount != null ? Number(tradeAmount) : null);

    const rubFromFx = toRub(tradeAmountWithComm, fx_rate, currency);

    const components = [];
    if (priceQtyStr) components.push(priceQtyStr);
    if (nkdNum) components.push(`${nkdStr}`);
    if (commission != null) components.push(`${formatNum(commission)}`);

    const componentsJoined = components.join(" + ");
    const fxNote = fx_rate != null ? `(курс ${symbol} ${formatNum(fx_rate)})` : "";

    if (currency === "SUR" || currency === "RUB") {
      const rubVal = rubFromFx != null ? rubFromFx : tradeAmountWithComm;
      const totalDisplay = rubVal != null ? formatCurrency(rubVal, "₽", "RUB") : "-";
      return `${totalDisplay} = ${componentsJoined}${fxNote ? " " + fxNote : ""}`;
    } else {
      const mainDisplay = tradeAmountWithComm != null ? formatCurrency(tradeAmountWithComm, symbol, currency) : "-";
      const rubDisplay = rubFromFx != null ? ` (${formatCurrency(rubFromFx, "₽", "RUB")})` : "";
      return `${mainDisplay}${rubDisplay} = ${componentsJoined}${fxNote ? " " + fxNote : ""}`;
    }
  };

  return (
  <>
    <div
      className="panel-header header-appear"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "0px 0",
      }}
    >
      <h3 className="heading-accent" style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.02 }}>
        Последние сделки
      </h3>
      <div style={{ fontSize: "0.70rem", color: "#6b7280", lineHeight: 1.02, marginRight: 10 }}>
        {trades.length} {trades.length === 1 ? "запись" : "записей"}
      </div>
    </div>

    <div className="trades-list compact-small" style={{ flex: 1, overflowY: "auto", paddingTop: 6 }}>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {trades.length === 0 && (
          <li style={{ padding: "4px 6px", color: "#666", lineHeight: 1.02 }}>Нет данных</li>
        )}

        {trades.map((t) => (
          <li
            key={t.id}
            style={{
              cursor: "pointer",
              padding: "2px 3px",
              borderRadius: 6,
              transition: "background-color 0.12s ease",
              lineHeight: 1.02,
            }}
            onClick={() => handleDeleteClick(t)}
            title="Нажмите, чтобы удалить"
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.998)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            {t.buy_date ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.75rem" }}> 
                <div style={{ minWidth: 75, fontSize: "0.75rem", lineHeight: 1.02 }}>[{formatDate(t.buy_date)}] </div>
                <div style={{ color: "green", minWidth: 55, fontSize: "0.75rem", lineHeight: 1.02 }}>
                   Покупка
                </div>
                <div style={{ flex: 1 }}>
                  <strong style={{ display: "inline-block", marginRight: 6, fontSize: "0.8rem", minWidth: 85}}>
                    {t.bond?.name ?? "-"}
                  </strong>
                  <span style={{ color: "#111", fontSize: "0.75rem" }}>{renderTradeLine(t)}</span>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ color: "#ef4444", minWidth: 100, fontSize: "0.75rem", lineHeight: 1.02 }}>
                  [{formatDate(t.sell_date)}] Продажа
                </div>
                <div style={{ flex: 1 }}>
                  <strong style={{ display: "inline-block", marginRight: 6, fontSize: "0.88rem" }}>
                    {t.bond?.name ?? "-"}
                  </strong>
                  <span style={{ color: "#111", fontSize: "0.86rem" }}>{renderTradeLine(t)}</span>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>

    {confirmOpen && (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Подтверждение удаления сделки"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10000,
          padding: 12,
        }}
      >
        <div
          style={{
            background: "#fff",
            padding: 16,
            borderRadius: 8,
            minWidth: 300,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            lineHeight: 1.1,
          }}
        >
          <p style={{ margin: 0, marginBottom: 10, fontWeight: 600, fontSize: "0.95rem" }}>
            Удалить сделку {tradeToDelete?.bond?.name ?? tradeToDelete?.bond_name ?? `#${tradeToDelete?.id}`}?
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              onClick={() => setConfirmOpen(false)}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid #ddd",
                background: "#fff",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              Отмена
            </button>
            <button
              onClick={confirmDelete}
              style={{
                background: "#ef4444",
                color: "#fff",
                padding: "6px 12px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
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
