// frontend/src/SummaryPanel.jsx
import React, { useState } from "react";

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
  const [editing, setEditing] = useState(false);   // 🔹 состояние "редактируем/нет"
  const [tempValue, setTempValue] = useState(invested); // 🔹 временное значение

  const handleSave = async () => {
    try {
      const res = await fetch("/api/portfolio_summary", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invested: parseFloat(tempValue) }),
      });
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
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
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setEditing(false);
      setTempValue(invested); // откат
    }
  };

  const getPercentColor = (value) => {
    if (value > 100) return "green";
    if (value < 100) return "red";
    return "black";
  };

  const formatNum = (n) => {
    if (n == null) return "-";
    return new Intl.NumberFormat("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  };

  // проверка красным/зеленым  Общая сумма:
  const getTotalColor = (total, trades) => {
    if (total > trades) return "green";
    if (total < trades) return "red";
    return "black";
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
        <span>{formatNum(tradesSum)}</span>
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
        <span style={{ color: getTotalColor(totalValue, tradesSum) }}>
          {formatNum(totalValue)}
        </span>
      </div>
      <div className="summary-item">
        <label>% от прибыли:</label>
        <span style={{ color: getPercentColor(profitPercent) }}>
          {formatNum(profitPercent)}%
        </span>
      </div>
    </div>
  );
}
