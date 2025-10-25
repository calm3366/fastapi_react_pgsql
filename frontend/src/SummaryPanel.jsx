import React, { useState, useEffect, useMemo } from "react";
import { apiFetch } from "./api";
import { useFxRates, formatNum, formatRub, computeTradesSumInRub } from "./SummaryDataHelpers";

export default function SummaryPanel({
  invested,
  setInvested,
  tradesSum, 
  setTradesSum,
  couponProfit,
  setCouponProfit,
  currentValue,
  setCurrentValue,
  totalValue,
  setTotalValue,
  profitPercent,
  setProfitPercent,
}) {
  const [editing, setEditing] = useState(false);
  const [tempValue, setTempValue] = useState(invested);
  const [localTradesSumInRub, setLocalTradesSumInRub] = useState(null);

  useEffect(() => setTempValue(invested), [invested]);

  const { fxRates } = useFxRates();

  useEffect(() => {
    let mounted = true;

    async function loadClientBreakdown() {
      try {
        const endpoints = ["/positions", "/trades", "/api/trades_breakdown"];
        let payload = null;

        for (const ep of endpoints) {
          try {
            const json = await apiFetch(ep);
            if (json && (Array.isArray(json) || json.by_currency || json.positions)) {
              payload = { ep, json };
              break;
            }
          } catch {
            // пробуем следующий
          }
        }

        if (!mounted || !payload) return;
        const { ep, json } = payload;

        let items = [];
        if (ep === "/api/trades_breakdown" && json.by_currency) {
          if (Array.isArray(json.by_currency)) {
            items = json.by_currency.map((it) => ({
              amount: Number(it.amount || 0),
              currency: it.currency || "SUR",
            }));
          } else {
            items = Object.entries(json.by_currency).map(([c, a]) => ({
              amount: Number(a || 0),
              currency: c,
            }));
          }
        } else {
          const arr = Array.isArray(json) ? json : (json.positions || []);
          items = arr.map((it) => {
            const cur = (it.currency || it.currency_code || it.ccy || "SUR").toString().toUpperCase();
            let amount = null;
            if (it.amount != null) amount = Number(it.amount);
            else if (it.price != null && (it.qty != null || it.buy_qty != null)) {
              const q = Number(it.qty ?? it.buy_qty ?? it.total_qty ?? 0);
              amount = Number(it.price) * q;
            } else if (it.last_price != null && (it.total_qty != null || it.held_qty != null || it.qty != null)) {
              const q = Number(it.total_qty ?? it.held_qty ?? it.qty ?? 0);
              amount = Number(it.last_price) * q;
            }
            return { amount: amount ?? 0, currency: cur, raw: it };
          });
        }

        let total = 0;
        for (const it of items) {
          const amt = Number(it.amount || 0);
          const cur = (it.currency || "SUR").toString().toUpperCase();
          if (cur === "SUR" || cur === "RUB") {
            total += amt;
          } else {
            const rate = fxRates[cur];
            if (rate && isFinite(rate) && rate !== 0) {
              total += amt * rate;
            }
          }
        }

        if (mounted && typeof tradesSum === "number" && total > 0) {
          setLocalTradesSumInRub(total);
        }
      } catch {
        // noop
      }
    }

    if (typeof tradesSum === "number") loadClientBreakdown();
    return () => { mounted = false; };
  }, [tradesSum, fxRates]);

  const tradesSumComputed = useMemo(
    () => computeTradesSumInRub(tradesSum, fxRates),
    [tradesSum, fxRates]
  );

  const tradesSumInRub = localTradesSumInRub != null ? localTradesSumInRub : tradesSumComputed.total;

  const displayTotal = useMemo(() => {
    if (totalValue != null && !Number.isNaN(Number(totalValue))) return Number(totalValue);
    const inv = Number(invested || 0);
    const cp = Number(couponProfit || 0);
    const cur = Number(currentValue || 0);
    return inv + tradesSumInRub + cp + cur;
  }, [totalValue, invested, couponProfit, currentValue, tradesSumInRub]);

  const getPercentColor = (value) => (value > 100 ? "green" : value < 100 ? "red" : "black");
  const getTotalColor = (total, trades) => (total > trades ? "green" : total < trades ? "red" : "black");

  const handleSave = async () => {
    try {
      const data = await apiFetch("/api/portfolio_summary", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invested: parseFloat(tempValue) }),
      });
      setInvested(data.invested ?? 0);
      setTradesSum(data.trades_sum ?? 0);
      setCouponProfit(data.coupon_profit ?? 0);
      setCurrentValue(data.current_value ?? 0);
      setTotalValue(data.total_value ?? 0);
      setProfitPercent(data.profit_percent ?? 0);
    } catch (err) {
      console.error("Ошибка сохранения вложено", err);
    } finally {
      setEditing(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSave();
    else if (e.key === "Escape") {
      setEditing(false);
      setTempValue(invested);
    }
  };

  return (
    <div className="summary-panel">
      <div className="summary-item">
        <label>Вложено:</label>
        {editing ? (
          <input
            type="number"
            autoFocus
            value={tempValue}
            onChange={(e) => setTempValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => setEditing(false)}
          />
        ) : (
          <span
            style={{ cursor: "pointer", borderBottom: "1px dashed #999" }}
            onClick={() => setEditing(true)}
          >
            {formatNum(invested)}
          </span>
        )}
      </div>

      <div className="summary-item">
        <label>Сумма сделок:</label>
        <span>{formatRub(tradesSumInRub)}</span>
      </div>
      <div className="summary-item">
        <label>Прибыль от купонов:</label>
        <span>{formatNum(couponProfit)}</span>
      </div>
      <div className="summary-item">
        <label>Текущая стоимость облигаций:</label>
        <span>{formatNum(currentValue)}</span>
      </div>
      <div className="summary-item">
        <label>Общая сумма:</label>
        <span style={{ color: getTotalColor(displayTotal, tradesSumInRub) }}>
          {formatRub(displayTotal)}
        </span>
      </div>
      <div className="summary-item">
        <label>% прибыли:</label>
        <span style={{ color: getPercentColor(profitPercent) }}>
          {formatNum(profitPercent)}%
        </span>
      </div>
    </div>
  );
}
