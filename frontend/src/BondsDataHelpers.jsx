// frontend/src/BondsDataHelpers.jsx
import { parseNumber, parseCandidates } from "./BondRowHelpers";

const ABS_CANDIDATES_WEIGHT = ["bond_value","value","amount","total","total_value","market_value","sum","amt"];
const ABS_CANDIDATES_BOND   = ["market_value","position_value","nominal_value","amount","value","position","sum","total_value","amt","qty","quantity"];

const coerceNumber = (v) => {
  if (v == null) return null;
  if (typeof v === "number" && isFinite(v)) return Number(v);
  try {
    const s = String(v).trim().replace(/\s+/g,"").replace(/,/g,".").replace(/[^\d\.\-]/g,"");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  } catch (e) { return null; }
};

export function computeMergedBonds(bonds = [], bondsWithWeights = [], fxRates = {}, formatPrice, positionsByBond = {}, tradesByBond = {}) {
  if (!Array.isArray(bonds)) return [];

  const seen = new Set();
  const uniqueBonds = [];
  for (const b of bonds) {
    const id = b?.id ?? b?.secid ?? null;
    if (id == null) continue;
    if (seen.has(String(id))) continue;
    seen.add(String(id));
    uniqueBonds.push(b);
  }
  const prepared = uniqueBonds.map(b => {
    const w = (bondsWithWeights || []).find(x => String(x.id) === String(b.id)) || {};
    let absRaw = null;
    let absFoundIn = null;

    const fromWeight = parseCandidates(w, ABS_CANDIDATES_WEIGHT);
    if (fromWeight != null) { absRaw = fromWeight; absFoundIn = "weight"; }

    if (absRaw == null) {
      const fromBond = parseCandidates(b, ABS_CANDIDATES_BOND);
      if (fromBond != null) { absRaw = fromBond; absFoundIn = "bond"; }
    }

    if (absRaw == null && positionsByBond && positionsByBond[String(b.id)]) {
      const pos = positionsByBond[String(b.id)];
      const posQty = parseNumber(pos.qty ?? pos.quantity ?? pos.total_qty ?? pos.position ?? pos.held_qty ?? null);
      const posPrice = coerceNumber(pos.last_price ?? pos.price ?? b.last_price ?? null);
      if (posQty != null && posPrice != null) { absRaw = posQty * posPrice; absFoundIn = "positionsApi.qty*price"; }
      else if (pos.amount != null) { absRaw = Number(pos.amount); absFoundIn = "positionsApi.amount"; }
    }

    if (absRaw == null) {
      const qty = parseNumber(b.total_qty ?? b.qty ?? b.quantity ?? b.position ?? b.held_qty ?? null)
                ?? parseNumber(w.qty ?? w.total_qty ?? w.quantity ?? null);
      const lastPrice = coerceNumber(b.last_price ?? b.price ?? null);
      if (qty != null && lastPrice != null) { absRaw = qty * lastPrice; absFoundIn = "bond.qty*lastPrice"; }
    }

    if (tradesByBond && tradesByBond[String(b.id)]) {
      const t = tradesByBond[String(b.id)];
      const tradeQty = t && t.qty != null ? Number(t.qty) : null;
      const tradeAmt = t && t.amount != null ? Number(t.amount) : null;
      const bondPrice = coerceNumber(b.last_price ?? b.price ?? b.market_price ?? null);
      const tradePrice = coerceNumber(t?.last_price ?? t?.price ?? null);
      const usePrice = bondPrice != null ? bondPrice : tradePrice;
      if (tradeQty != null && usePrice != null && absRaw == null) {
        absRaw = tradeQty * usePrice;
        absFoundIn = "tradesQty*lastPrice";
      } else if (tradeAmt != null && absRaw == null) {
        absRaw = tradeAmt;
        absFoundIn = "tradesTotalAmount";
      }
      if (tradeQty != null) b._tradeCandidate = { qty: tradeQty, price: usePrice, derived: (usePrice != null ? tradeQty*usePrice : null) };
    }

    if (absRaw == null) {
      const price = coerceNumber(b.price ?? b.last_price ?? null);
      const qty = parseNumber(b.qty ?? b.total_qty ?? b.quantity ?? null);
      if (price != null && qty != null) { absRaw = price * qty; absFoundIn = "derived.price*qty"; }
    }

    let srcCurrency = null;
    if (absFoundIn === "weight") srcCurrency = (w && (w.currency || w.currency_code)) ?? b.currency ?? null;
    else srcCurrency = b.currency ?? null;
    srcCurrency = srcCurrency ? String(srcCurrency).toUpperCase().trim() : null;
    const srcSymbol = b.currency_symbol || (w && w.currency_symbol) || null;

    return { bond: b, weightObj: w, absRaw, absFoundIn, srcCurrency, srcSymbol };
  });

  // hard force: если tradesByBond[id].qty существует, прямо запишите p.absRaw = qty * bond.last_price (no checks)
    for (const p of prepared) {
    const b = p.bond;
    const t = tradesByBond && tradesByBond[String(b.id)];
    if (!t || t.qty == null) continue;
    const q = Number(t.qty);
    const bp = coerceNumber(b.last_price ?? b.price ?? null) ?? coerceNumber(t.last_price ?? t.price ?? null);
    if (isFinite(q) && bp != null) {
        p.absRaw = q * bp;
        p.absFoundIn = "hardForce.tradesQty*bondPrice";
    }
    }

  const tryGetFx = (cur) => {
    if (!cur) return null;
    const k = String(cur).toUpperCase();
    return fxRates?.[k] ?? fxRates?.[k.slice(0,3)] ?? null;
  };
  const toRub = (val, currency) => {
    if (val == null) return null;
    const cur = (currency || "SUR")?.toUpperCase();
    if (!cur || cur === "SUR" || cur === "RUB") return Number(val);
    const rate = tryGetFx(cur);
    if (!rate || !isFinite(Number(rate)) || Number(rate) === 0) return null;
    return Number(val) * Number(rate);
  };

  let totalValueInRub = 0;
  for (const p of prepared) {
    const vRub = toRub(p.absRaw, p.srcCurrency);
    if (vRub != null) totalValueInRub += vRub;
  }

  const formatCurrencyForAbs = (val, currencySymbol, currencyCode) => {
    if (val == null) return null;
    if (typeof formatPrice === "function") {
      try {
        const formatted = formatPrice(val, currencyCode);
        if (currencySymbol && !formatted.includes(currencySymbol)) return `${formatted} ${currencySymbol}`;
        return formatted;
      } catch (e) {}
    }
    const sym = currencySymbol || (currencyCode === "USD" ? "$" : currencyCode === "EUR" ? "€" : "₽");
    return `${Number(val).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${sym}`;
  };

  return prepared.map(p => {
    const b = p.bond;
    const w = p.weightObj;
    let weightNum = null;
    if (w && w.weight_percent != null) {
      weightNum = parseNumber(w.weight_percent);
    } else if (w && w.abs_value_in_rub != null) {
      const avr = Number(w.abs_value_in_rub);
      if (!Number.isNaN(avr) && totalValueInRub > 0) weightNum = (avr / totalValueInRub) * 100;
    } else {
      const vRub = p.absRaw != null ? toRub(p.absRaw, p.srcCurrency) : null;
      if (vRub != null && totalValueInRub > 0) weightNum = (vRub / totalValueInRub) * 100;
      else if (w && w.weight != null) {
        const maybe = parseNumber(w.weight);
        if (maybe != null && maybe > 0 && maybe <= 100) weightNum = maybe;
      }
    }
    if (weightNum != null) weightNum = Number(weightNum);
    const weightDisplay = weightNum != null ? `${weightNum.toFixed(2)}%` : "-";
    const weightAbsDisplay = p.absRaw != null ? `(${formatCurrencyForAbs(p.absRaw, p.srcSymbol, p.srcCurrency)})` : "";

    return {
      ...b,
      weight: weightNum != null ? Number(weightNum.toFixed(6)) : null,
      weightDisplay,
      weightAbsDisplay,
      fxRate: b.currency && b.currency !== "SUR" ? (tryGetFx(b.currency) || 1) : 1,
      last_price: parseNumber(b.last_price),
      _absFoundIn: p.absFoundIn,
    };
  });
}
