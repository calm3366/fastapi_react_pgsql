// frontend/src/BondsTable.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  currencySymbols,
  formatMoney,
  tryGetRate,
  toRub,
  renderArrows,
  WeightCell,
  computeMergedBondsWithValues,
  computeTradesByBond
} from "./BondRowHelpers";

export default function BondsTable(props) {
  const {
    mergedBonds = [],
    selectedIds = [],
    toggleSelect,
    toggleSelectAll,
    handleRowClick,
    lastUpdateTime,
    handleDelete,
    handleRefreshClick,
    refreshing,
    progress,
    formatDate,
    getCategory,
    CATEGORY_COLORS,
    formatPrice
  } = props;

  // trades loading
  const [trades, setTrades] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const loadTrades = async () => {
      try {
        const res = await fetch("/api/trades");
        if (!res.ok) throw new Error(res.statusText);
        const data = await res.json();
        if (!cancelled) setTrades(Array.isArray(data) ? data : []);
      } catch (e) {
        console.warn("Failed to load trades for bonds aggregation", e);
        if (!cancelled) setTrades([]);
      }
    };
    loadTrades();
    return () => { cancelled = true; };
  }, []);

  // compute tradesByBond using helper
  const tradesByBond = useMemo(() => computeTradesByBond(trades), [trades]);

  // fx rates with retry
  const [fxRates, setFxRates] = useState({});
  const [fxRetry, setFxRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const loadFx = async () => {
      try {
        const res = await fetch("/fxrates");
        if (!res.ok) throw new Error(`FX fetch failed ${res.status}`);
        const data = await res.json();
        const map = {};
        if (Array.isArray(data)) {
          for (const r of data) {
            if (!r || !r.currency) continue;
            const key = String(r.currency).trim().toUpperCase().slice(0, 3);
            const rate = Number(r.rate);
            if (isFinite(rate) && rate > 0) map[key] = rate;
          }
        } else if (data && typeof data === "object") {
          for (const k of Object.keys(data)) {
            const key = String(k).trim().toUpperCase().slice(0, 3);
            const candidate = data[k];
            const rate = (candidate && candidate.rate != null) ? Number(candidate.rate) : Number(candidate);
            if (isFinite(rate) && rate > 0) map[key] = rate;
          }
        }
        if (!cancelled) {
          setFxRates(map);
          setFxRetry(0);
        }
      } catch (err) {
        console.warn("Failed to load fx rates", err);
        if (!cancelled) {
          setFxRates(prev => (prev && Object.keys(prev).length > 0) ? prev : {});
          if (fxRetry < 3) setTimeout(() => setFxRetry(prev => prev + 1), 1000 * (fxRetry + 1));
        }
      }
    };
    loadFx();
    return () => { cancelled = true; };
  }, [fxRetry]);

  // compute mergedBondsWithValues using helper
  const mergedBondsWithValues = useMemo(() => {
    return computeMergedBondsWithValues(mergedBonds, tradesByBond, fxRates, currencySymbols);
  }, [mergedBonds, tradesByBond, fxRates]);

  // TEMP: export mergedBondsWithValues and tradesByBond for inspection in DevTools and log sample for id=103
  useEffect(() => {
    try { window.__mergedBondsWithValues = mergedBondsWithValues; } catch (e) {}
    try { window.__tradesByBond = tradesByBond; } catch (e) {}
  }, [mergedBondsWithValues, tradesByBond]);

  const hasFxBonds = mergedBonds.some(b => {
    const cur = (b.currency ?? "SUR").toString().trim().toUpperCase();
    return cur !== "SUR" && cur !== "RUB";
  });
  const fxLoaded = Object.keys(fxRates || {}).length > 0;

  // safe helpers for rendering: fallback names
  const safePercent = (row) => {
    if (!row) return null;
    if (row.weight != null && isFinite(Number(row.weight))) return Number(row.weight);
    if (row.weightPercent != null && isFinite(Number(row.weightPercent))) return Number(row.weightPercent);
    if (typeof row.weightDisplay === "string" && row.weightDisplay.endsWith("%")) {
      const n = parseFloat(row.weightDisplay.replace("%",""));
      if (!Number.isNaN(n)) return n;
    }
    return null;
  };

  const parseFormattedAmount = (s) => {
    if (!s || typeof s !== "string") return null;
    const m = s.match(/([\d\s\.,]+)/);
    if (!m) return null;
    const sanitized = m[1].trim().replace(/\s+/g,"").replace(/,/g,".");
    const n = Number(sanitized);
    return isFinite(n) ? n : null;
  };

  const safeValue = (row) => {
    if (!row) return null;
    if (row.abs_value != null && isFinite(Number(row.abs_value))) return Number(row.abs_value);
    if (row.abs_value_in_native != null && isFinite(Number(row.abs_value_in_native))) return Number(row.abs_value_in_native);
    if (row.absRaw != null && isFinite(Number(row.absRaw))) return Number(row.absRaw);
    if (row.weightAbsDisplay && typeof row.weightAbsDisplay === "string") {
      const parsed = parseFormattedAmount(row.weightAbsDisplay);
      if (parsed != null) return parsed;
    }
    return null;
  };

  const safeValueInRub = (row) => {
    if (!row) return null;
    if (row.abs_value_in_rub != null && isFinite(Number(row.abs_value_in_rub))) return Number(row.abs_value_in_rub);
    const v = safeValue(row);
    const cur = row.srcCurrency ?? row.currency ?? row.currency_code ?? null;
    if (v != null && cur) {
      const rate = tryGetRate(fxRates, cur);
      if (rate != null && isFinite(Number(rate))) return v * Number(rate);
    }
    if (row.weightAbsDisplay && typeof row.weightAbsDisplay === "string" && row.weightAbsDisplay.includes("₽")) {
      const parsed = parseFormattedAmount(row.weightAbsDisplay);
      if (parsed != null) return parsed;
    }
    return null;
  };

  const safeSymbol = (row) => {
    if (!row) return "";
    return row.display_symbol ?? row.currency_symbol ?? currencySymbols[row.currency] ?? row.currency ?? "";
  };

  const formatTimeDate = (dt) => {
        if (!dt) return "-";
        const d = new Date(dt);
        if (isNaN(d)) return "-";
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = String(d.getFullYear()).padStart(4, "0");
        const hours = String(d.getHours()).padStart(2, "0");
        const minutes = String(d.getMinutes()).padStart(2, "0");
        const seconds = String(d.getSeconds()).padStart(2, "0");
        return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
    };

    // helper: robust extraction of qty from tradesByBond entry
  const getQtyFromTradesByBond = (bondId) => {
    if (!tradesByBond || bondId == null) return 0;
    const entry = tradesByBond[bondId] ?? tradesByBond[String(bondId)];
    if (!entry) return 0;
    // entry can be number, object with total_qty / qty / buy_qty, or array of trades
    if (typeof entry === "number" && isFinite(entry)) return Number(entry);
    if (Array.isArray(entry)) {
      return entry.reduce((s, t) => s + (isFinite(Number(t.buy_qty)) ? Number(t.buy_qty) : 0), 0);
    }
    if (typeof entry === "object") {
      if (isFinite(Number(entry.total_qty))) return Number(entry.total_qty);
      if (isFinite(Number(entry.qty))) return Number(entry.qty);
      if (isFinite(Number(entry.buy_qty))) return Number(entry.buy_qty);
      // fallback: sum array fields if present
      if (Array.isArray(entry.trades)) {
        return entry.trades.reduce((s, t) => s + (isFinite(Number(t.buy_qty)) ? Number(t.buy_qty) : 0), 0);
      }
    }
    return 0;
  };

 return (
  <div className="bonds-panel-root">
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h2 className="heading-accent header-appear" style={{ margin: 0 }}>Сохранённые облигации</h2>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, minWidth: 350 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="header-sub" style={{ marginTop: 10, color: "#666", fontSize: "0.70rem" }}>
            {formatDate ? `Последнее обновление: ${formatTimeDate(lastUpdateTime)}` : (lastUpdateTime ?? "-")}
          </span>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleRefreshClick}
              disabled={refreshing}
              className={`btn btn-refresh ${refreshing ? "disabled" : "enabled"}`}
              style={{ padding: "6px 12px" }}
            >
              {refreshing ? "Обновление..." : "Обновить"}
            </button>

            <button
              onClick={handleDelete}
              disabled={selectedIds.length === 0}
              className={`btn btn-delete ${selectedIds.length > 0 ? "enabled" : "disabled"}`}
              style={{ padding: "6px 12px" }}
            >
              Удалить выбранные
            </button>
          </div>
        </div>

        {refreshing && (
          <div className="refresh-progress" style={{ width: 140 }}>
            <div className="bar" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    </div>

    {hasFxBonds && !fxLoaded && (
      <div style={{ margin: "8px 0", color: "#777" }}>
        Загрузка текущих курсов... рублёвый эквивалент появится после получения данных
      </div>
    )}

    <table className="bonds-table" border="1" cellPadding="6" style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
      <thead>
        <tr style={{ background: "#eee" }}>
          <th>
            <input
              type="checkbox"
              checked={selectedIds.length === mergedBondsWithValues.length && mergedBondsWithValues.length > 0}
              onChange={toggleSelectAll}
            />
          </th>
          <th>Рейтинг</th>
          <th>Краткое название</th>
          <th>Купон</th>
          <th style={{ minWidth: 50, overflow: "hidden", textOverflow: "ellipsis" }}>YTM</th>
          <th style={{ minWidth: 70, overflow: "hidden", textOverflow: "ellipsis" }}>Стоимость</th>
          <th style={{ minWidth: 60, overflow: "hidden", textOverflow: "ellipsis" }}>НКД</th>
          <th style={{ overflow: "hidden", textOverflow: "ellipsis"}}>Д/Н/М/Г</th>
          <th>Вес</th>
          <th>Дата погашения</th>
          <th>Аморт.</th>
          <th>Дата оферты</th>
        </tr>
      </thead>

      <tbody>
        {mergedBondsWithValues
          .slice()
          .sort((a, b) => (safePercent(b) ?? 0) - (safePercent(a) ?? 0))
          .map((row) => {
            const b = row;
            const category = getCategory ? getCategory(b) : null;
            const isRub = !b.currency || b.currency === "SUR" || b.currency === "RUB";
            const displayPrice = (() => {
              if (b.last_price == null) return "-";
              if (formatPrice) {
                const formatted = formatPrice(b.last_price, b.currency);
                return isRub ? `${formatted} ₽` : formatted;
              }
              return isRub
                ? `${Number(b.last_price).toFixed(2)} ₽`
                : `${Number(b.last_price).toFixed(2)} ${currencySymbols[b.currency] ?? b.currency}`;
            })();

            const percent = safePercent(b);
            const numericValue = safeValue(b);
            const numericValueInRub = safeValueInRub(b);
            const symbol = safeSymbol(b);

            const ratingDisplay = (() => {
              const parts = [];
              if (b.akra_rating) parts.push(`АКРА: ${b.akra_rating}`);
              if (b.raexpert_rating) parts.push(`ЭкспРА: ${b.raexpert_rating}`);
              if (parts.length === 0 && b.rating) parts.push(b.rating);
              return parts.join("\n");
            })();

            return (
              <tr
                key={b.id}
                onClick={(e) => handleRowClick && handleRowClick(e, b)}
                className={b.stale ? "row stale" : (category ? `row ${category}` : "row")}
                style={{ cursor: "pointer", transition: "background-color 0.2s ease", opacity: b.stale ? 0.6 : 1 }}
              >
                <td>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(b.id)}
                    onChange={(e) => { e.stopPropagation(); toggleSelect && toggleSelect(b.id); }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </td>

                <td className="rating" style={{ textAlign: "center", whiteSpace: "pre-line" }}>
                  {b.name?.toUpperCase().includes("ОФЗ")
                    ? "AAA"
                    : (b.rating && b.rating !== "Нет рейтинга" ? b.rating : "-")}
                </td>

                <td style={{ fontWeight: 600, textAlign: "left" }}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{  textAlign: "center",fontSize: "0.85rem" }}>{b.name}</span>
                    {b.ticker && <span className="header-sub" style={{ marginTop: 2 }}>{b.ticker}</span>}
                  </div>
                </td>

                <td style={{ textAlign: "center" }}>{b.coupon_display ?? (b.coupon != null ? `${b.coupon}%` : "-")}</td>

                <td style={{ textAlign: "center" }}>{b.ytm != null ? `${b.ytm.toFixed(2)}%` : "-"}</td>

                <td style={{ textAlign: "center" }}>
                  <div>{displayPrice}</div>
                  {b.last_buy_price != null && b.last_price != null && (
                    <div style={{ fontSize: "0.75em", color: b.last_price < b.last_buy_price ? "red" : b.last_price > b.last_buy_price ? "green" : "gray" }}>
                      {(!isFinite(Number(b.last_price)) || !isFinite(Number(b.last_buy_price)) || Number(b.last_buy_price) === 0)
                        ? "-"
                        : (((Number(b.last_price) - Number(b.last_buy_price)) / Number(b.last_buy_price)) * 100).toFixed(2) + "%"}
                    </div>
                  )}
                </td>
                <td style={{ textAlign: "center", verticalAlign: "middle", minWidth: 80 }}>
                  {(() => {
                    const nkdRaw = b.nkd ?? b.accruedint ?? null;
                    const nkdNum = (nkdRaw != null && isFinite(Number(nkdRaw))) ? Number(nkdRaw) : null;
                    if (nkdNum == null) return <span style={{ color: "#666" }}>-</span>;

                    // qty from aggregated tradesByBond (primary), fallback to fields on b
                    const qtyFromTrades = getQtyFromTradesByBond(b.id);
                    let qty = qtyFromTrades;
                    if (!qty || qty === 0) {
                      const qtyCandidates = ["total_qty", "buy_qty", "position_qty", "quantity", "qty"];
                      for (const key of qtyCandidates) {
                        if (Object.prototype.hasOwnProperty.call(b, key) && isFinite(Number(b[key]))) {
                          qty = Number(b[key]);
                          if (qty) break;
                        }
                      }
                    }

                    const nkdStr = Number(nkdNum).toFixed(2);
                    const displayMain = `${nkdStr} ₽`;

                    const showTotal = qty && qty > 0;
                    const totalAmount = showTotal ? Number(nkdNum * qty) : 0;
                    const totalStr = totalAmount > 0 ? (totalAmount.toFixed(2) + " ₽") : null;

                    return (
                      <div
                        style={{ fontSize: "0.8rem", color: "#111" }}
                        title={totalStr ? `НКД: ${nkdStr} ₽ — Кол-во=${qty} — общая ${totalStr}` : `НКД: ${nkdStr} ₽`}
                      >
                        <span>{displayMain}</span>
                        {totalStr && <span style={{fontSize: "0.7rem", color: "#555", marginLeft: 6 }}>({totalStr})</span>}
                      </div>
                    );
                  })()}
                </td>

                <td style={{ padding: "0", textAlign: "center", verticalAlign: "middle", width: 200 }}>
                    <div style={{ width: "100%",  marginTop: 2,  marginBottom: 2,  marginRight: 30 }}>
                        {renderArrows(b, formatPrice)}
                    </div>
                </td>

                <td className="col-weight" style={{ textAlign: "right", whiteSpace: "nowrap", minWidth: 100 }}>
                  <WeightCell
                    percent={percent}
                    value={numericValue}
                    valueInRub={numericValueInRub}
                    currency={b.currency}
                    symbol={symbol}
                    formatPrice={formatPrice}
                    weightDisplay={b.weightDisplay}
                    weightAbsDisplay={b.weightAbsDisplay}
                  />
                </td>

                <td style={{ textAlign: "center" }}>
                  {b.maturity_date ? (formatDate ? formatDate(b.maturity_date) : b.maturity_date) : "-"}
                </td>
                <td style={{ textAlign: "center" }}>{b.amortization_display ?? "-"}</td>
                <td style={{ textAlign: "center" }}>
                  {b.offer_date ? (formatDate ? formatDate(b.offer_date) : b.offer_date) : "-"}
                </td>
              </tr>
            );
          })}
      </tbody>
    </table>
  </div>
);

}
