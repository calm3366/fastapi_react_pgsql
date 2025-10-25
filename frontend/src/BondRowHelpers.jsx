// frontend/src/BondRowHelpers.jsx
import React from "react";

export const currencySymbols = { RUB: "₽", SUR: "₽", USD: "$", CNY: "¥", CNH: "¥", EUR: "€", GBP: "£" };

export const formatMoney = (amount, symbol, code) => {
  if (amount == null || !isFinite(Number(amount))) return "-";
  const numStr = Number(amount).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (symbol) return `${numStr} ${symbol}`;
  if (code) return `${numStr} ${code}`;
  return numStr;
};

export const tryGetRate = (map, keyRaw) => {
  if (!map) return null;
  const k = String(keyRaw ?? "").trim().toUpperCase();
  const candidates = [k, k.slice(0, 3), k.replace(/[^A-Z]/g, ''), k.slice(0, 2)];
  for (const c of candidates) {
    if (!c) continue;
    const v = map[c];
    if (v != null && isFinite(Number(v)) && Number(v) > 0) return Number(v);
  }
  return null;
};

export const toRub = (value, currency, fxRates = {}) => {
  if (value == null || !isFinite(Number(value))) return null;
  const cur = (currency || "SUR").toString().trim().toUpperCase();
  if (cur === "SUR" || cur === "RUB") return Number(value);
  const rate = tryGetRate(fxRates, cur);
  if (!rate) return null;
  return Number(value) * rate;
};

export const renderArrows = (bond, formatPrice) => {
  const isFx = bond.currency && bond.currency !== "SUR" && bond.currency !== "RUB";
  const symbol = bond.currency_symbol ?? currencySymbols[bond.currency] ?? (bond.currency || "");

  const formatAbs = (val) => {
    if (val == null || !isFinite(Number(val))) return "-";
    if (formatPrice) return formatPrice(val, bond.currency);
    return Number(val).toFixed(2);
  };

  const compareBlock = (currentRaw, baseRaw) => {
    const current = currentRaw == null ? NaN : Number(currentRaw);
    const base = baseRaw == null ? NaN : Number(baseRaw);

    if (!isFinite(current) || !isFinite(base)) {
      return (
        <div
          className="dwmy-item"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 75,     
            minHeight: 30,
            boxSizing: "border-box",
            padding: "0px 0px",
            fontSize: "0.9em",
          }}
        >
          <div className="dwmy-main" style={{ color: "#666", fontWeight: 600 }}>-</div>
          <div className="dwmy-pct" style={{ fontSize: 12, color: "#999", marginTop: 4 }}>-</div>
        </div>
      );
    }

    const diffAbs = current - base;
    const diffPct = base !== 0 ? (diffAbs / base) * 100 : NaN;
    const color = diffAbs > 0 ? "green" : diffAbs < 0 ? "red" : "#666";
    const icon = diffAbs > 0 ? "↑" : diffAbs < 0 ? "↓" : "-";

    const rawFormatted = formatAbs(Math.abs(diffAbs));
    const alreadyHasSymbol = symbol && String(rawFormatted).includes(symbol);
    const absValueOnly = alreadyHasSymbol
      ? rawFormatted
      : (isFx ? `${rawFormatted} ${symbol}` : `${rawFormatted} ₽`);

    const signedAbs = `${diffAbs > 0 ? "+" : diffAbs < 0 ? "-" : ""}${absValueOnly}`;
    const mainPct = isFinite(diffPct) ? `${diffPct > 0 ? "+" : ""}${diffPct.toFixed(2)}%` : "-";
    const smallAbs = signedAbs;

    return (
      <div
        className="dwmy-item"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 75,    
          minHeight: 30,
          boxSizing: "border-box",
          padding: "2px 0px",
          fontSize: "0.9em",
        }}
      >
        <div
          className="dwmy-main"
          style={{
            color,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 3,
            lineHeight: 1,
            textAlign: "center",
          }}
        >
          <span style={{ display: "inline-block", width: 10, textAlign: "center" }}>{icon}</span>
          <span>{mainPct}</span>
        </div>

        <div
          className="dwmy-pct"
          style={{
            fontSize: 11,
            color: "#666",
            marginTop: 1,
            lineHeight: 1,
            textAlign: "center",
          }}
        >
          {smallAbs}
        </div>
      </div>
    );
  };

  return (
    <div className="bonds-dwmy" style={{
      display: "flex",
      gap: 1,
      justifyContent: "center",
      alignItems: "center",
      width: "100%",
      padding: 0,
      margin: 0,
      boxSizing: "border-box",
    }}>
      {compareBlock(bond.last_price, bond.day_open)}
      {compareBlock(bond.last_price, bond.week_open)}
      {compareBlock(bond.last_price, bond.month_open)}
      {compareBlock(bond.last_price, bond.year_open)}
    </div>
  );
};




export function WeightCell(props) {
  const {
    percent,
    value,
    valueInRub,
    currency,
    symbol,
    formatPrice,
    weightDisplay,
    weightAbsDisplay
  } = props;

  const parseNumberFromString = (s) => {
    if (s == null) return null;
    if (typeof s === "number" && isFinite(s)) return Number(s);
    if (typeof s !== "string") return null;
    const m = s.match(/(-?[\d\s\.,]+)/);
    if (!m) return null;
    const cleaned = m[1].trim().replace(/\s+/g, "").replace(/,/g, ".");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  };

  const safePercent = (() => {
    if (percent != null && isFinite(Number(percent))) return Number(percent);
    if (typeof weightDisplay === "string") {
      const p = weightDisplay.trim().replace("%", "");
      const n = Number(p);
      if (isFinite(n)) return n;
    }
    return null;
  })();

  const safeValue = (() => {
    if (value != null && isFinite(Number(value))) return Number(value);
    if (weightAbsDisplay != null) {
      const n = parseNumberFromString(weightAbsDisplay);
      if (n != null) return n;
    }
    return null;
  })();

  const safeValueInRub = (() => {
    if (valueInRub != null && isFinite(Number(valueInRub))) return Number(valueInRub);
    return null;
  })();

  const formatAbsolute = (v, cur) => {
    if (v == null) return "-";
    try {
      if (typeof formatPrice === "function") return formatPrice(v, cur);
    } catch (e) {}
    const sym = symbol || (cur === "USD" ? "$" : cur === "EUR" ? "€" : cur || "₽");
    return `${Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${sym}`;
  };

  const isRub = !currency || String(currency).toUpperCase() === "SUR" || String(currency).toUpperCase() === "RUB";

  // один масштаб/стиль для верхней строки (percent и native amount)
  const topStyle = { fontSize: 13, color: "#111", fontWeight: 600, lineHeight: 1 };
  const topSmallStyle = { fontSize: 13, color: "#333", fontWeight: 600, lineHeight: 1 };

  return (
    <div
        style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        minWidth: 100,
        gap: 8,
        padding: "4px 6px",
        boxSizing: "border-box",
        }}
    >
        {/* Процент — фиксированная колонка, текст по центру по высоте */}
        <div style={{ width: 32, display: "flex", alignItems: "center", textAlign: "left" }}>
        <div style={{ ...topSmallStyle, lineHeight: 1, width: "100%" }}>
            {safePercent != null ? `${safePercent.toFixed(2)}%` : (weightDisplay ?? "-")}
        </div>
        </div>

        {/* Значения справа — выровнены по правому краю и центрированы по высоте */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center", flex: 1 }}>
        <div style={{ ...topStyle, whiteSpace: "nowrap" }}>
            {safeValue != null
                ? (
                    (currency == null || String(currency).toUpperCase() === "RUB" || String(currency).toUpperCase() === "SUR")
                        ? (
                            <>
                            <span>{formatAbsolute(safeValue, currency)} </span>
                            <span style={{ fontWeight: 900, fontSize: "1.02em" }}>₽</span>
                            </>
                        )
                        : formatAbsolute(safeValue, currency)
                    )
                : (weightAbsDisplay != null
                    ? (
                        (currency == null || String(currency).toUpperCase() === "RUB" || String(currency).toUpperCase() === "SUR")
                            ? (
                                <>
                                <span>{weightAbsDisplay} </span>
                                <span style={{ fontWeight: 900, fontSize: "1.02em" }}>₽</span>
                                </>
                            )
                            : `${weightAbsDisplay}`
                        )
                    : "-")}
        </div>

        {!isRub && safeValueInRub != null && (
            <div style={{ marginTop: 4, color: "#666", fontSize: 12 }}>
            {Number(safeValueInRub).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽
            </div>
      )}
    </div>
  </div>
);


}


export const computeMergedBondsWithValues = (mergedBonds, tradesByBond, fxRates, currencySymbolsMap = currencySymbols) => {
  if (!Array.isArray(mergedBonds)) return [];

  return mergedBonds.map(b => {
    // normalize key for tradesByBond lookup
    const key = String(b.id ?? b.secid ?? b.isin ?? "");
    const agg = tradesByBond && (tradesByBond[key] || tradesByBond[String(b.id)]) ? (tradesByBond[key] || tradesByBond[String(b.id)]) : null;

    // Prefer precomputed merged fields (absRaw, abs_value, weightAbsDisplay)
    const fromMerged_absRaw = (b.absRaw != null && isFinite(Number(b.absRaw))) ? Number(b.absRaw) : null;
    const fromMerged_absValue = (b.abs_value != null && isFinite(Number(b.abs_value))) ? Number(b.abs_value) : null;
    const fromMerged_weightAbsDisplay = (b.weightAbsDisplay && typeof b.weightAbsDisplay === "string") ? (() => {
      const m = b.weightAbsDisplay.match(/([\d\s\.,]+)/);
      if (!m) return null;
      const s = m[1].trim().replace(/\s+/g,"").replace(/,/g,".");
      const n = Number(s);
      return isFinite(n) ? n : null;
    })() : null;
    const resolvedNative =
      fromMerged_absRaw != null ? fromMerged_absRaw
      : fromMerged_absValue != null ? fromMerged_absValue
      : fromMerged_weightAbsDisplay != null ? fromMerged_weightAbsDisplay
      : (agg && agg.amount != null && isFinite(Number(agg.amount)) ? Number(agg.amount) : null);
    const mergedCurrency = (b.display_currency ?? b.srcCurrency ?? b.currency ?? null);
    const aggCurrency = agg && agg.currency ? String(agg.currency) : null;
    const cur = (mergedCurrency || aggCurrency || "SUR").toString().trim().toUpperCase();

    let valueInRub = null;
    if (resolvedNative != null && isFinite(Number(resolvedNative))) {
      if (cur === "SUR" || cur === "RUB") {
        valueInRub = Number(resolvedNative);
      } else {
        const rate = tryGetRate(fxRates, cur);
        valueInRub = (rate != null) ? Number(resolvedNative) * Number(rate) : null;
      }
    } else {
      if (agg && agg.qty != null && isFinite(Number(agg.qty))) {
        const aggPrice = (agg.last_price != null && isFinite(Number(agg.last_price))) ? Number(agg.last_price)
                        : (b.last_price != null && isFinite(Number(b.last_price)) ? Number(b.last_price) : null);
        if (aggPrice != null) {
          const derived = Number(agg.qty) * aggPrice;
          if (cur === "SUR" || cur === "RUB") valueInRub = derived;
          else {
            const rate = tryGetRate(fxRates, cur);
            valueInRub = rate != null ? derived * Number(rate) : null;
          }
        }
      }
    }
    const explicitRub = (b.abs_value_in_rub ?? b.total_value_in_rub ?? b.position_value_in_rub ?? null);
    const explicitRubNum = (explicitRub != null && isFinite(Number(explicitRub))) ? Number(explicitRub) : null;
    const finalValueInRub = valueInRub != null ? valueInRub : explicitRubNum;
    const rawWeight = b.weight ?? b.weightPercent ?? null;
    const weightPercent = rawWeight == null ? null : (Number(rawWeight) > 1 ? Number(rawWeight) : Number(rawWeight) * 100);

    const displaySym = b.currency_symbol ?? currencySymbolsMap?.[cur] ?? cur;

    return {
      ...b,
      abs_value: resolvedNative != null ? resolvedNative : null,
      abs_value_in_rub: finalValueInRub != null ? finalValueInRub : null,
      weightPercent,
      display_currency: cur,
      display_symbol: displaySym
    };
  });
};


export const computeTradesByBond = (trades) => {
  if (!Array.isArray(trades) || trades.length === 0) return {};
  const map = {};
  for (const t of trades) {
    const bondIdRaw = t.bond_id ?? t.bond?.id ?? t.bondId ?? t.id;
    if (bondIdRaw == null) continue;
    const bondId = String(bondIdRaw);
    map[bondId] = map[bondId] || { amount: 0, qty: 0, last_price: null, currency: null, currency_symbol: null };

    if (t.total_amount != null && isFinite(Number(t.total_amount))) map[bondId].amount += Number(t.total_amount);
    else if (t.amount != null && isFinite(Number(t.amount))) map[bondId].amount += Number(t.amount);
    else {
      const price = isFinite(Number(t.buy_price)) ? Number(t.buy_price) : (isFinite(Number(t.sell_price)) ? Number(t.sell_price) : (isFinite(Number(t.price)) ? Number(t.price) : null));
      const qty = isFinite(Number(t.buy_qty)) ? Number(t.buy_qty) : (isFinite(Number(t.sell_qty)) ? Number(t.sell_qty) : (isFinite(Number(t.qty)) ? Number(t.qty) : 0));
      const nkd = isFinite(Number(t.buy_nkd)) ? Number(t.buy_nkd) : (isFinite(Number(t.sell_nkd)) ? Number(t.sell_nkd) : 0);
      if (price != null && qty != null) map[bondId].amount += price * qty + (nkd || 0);
    }

    if (t.buy_qty != null && isFinite(Number(t.buy_qty))) map[bondId].qty += Number(t.buy_qty);
    else if (t.qty != null && isFinite(Number(t.qty))) map[bondId].qty += Number(t.qty);
    if (t.sell_qty != null && isFinite(Number(t.sell_qty))) map[bondId].qty -= Number(t.sell_qty);

    if (t.last_price != null && isFinite(Number(t.last_price))) map[bondId].last_price = Number(t.last_price);
    else if (t.price != null && isFinite(Number(t.price))) map[bondId].last_price = Number(t.price);

    const cur = t.currency ?? t.bond?.currency ?? null;
    if (cur) map[bondId].currency = String(cur);
    const sym = t.currency_symbol ?? t.bond?.currency_symbol ?? null;
    if (sym) map[bondId].currency_symbol = sym;
  }
  return map;
};

export const parseNumber = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  const s = String(v).replace(/\u00A0/g, "").replace(/\s+/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export const parseCandidates = (obj, candidates) => {
  for (const k of candidates) {
    if (obj && obj[k] != null) return parseNumber(obj[k]);
  }
  return null;
};

export function getCategory(bond) {
  if (bond.currency && bond.currency !== "SUR") return "fx";
  if (bond.name?.toUpperCase().includes("ОФЗ")) return "ofz";
  if (bond.coupon_type?.toUpperCase().includes("ФИКС")) return "corpFix";
  if (bond.coupon_type?.toUpperCase().includes("ФЛОАТ")) return "corpFloat";
  return null;
}
