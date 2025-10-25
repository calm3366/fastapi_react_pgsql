// frontend/src/SummaryDataHelpers.js
import { useEffect, useState, useMemo } from "react";
import { apiFetch } from "./api";
/**
 * Hook useFxRates
 * - auto-loads /fxrates (every 60s)
 * - returns { fxRates: {CUR: rate}, fxLoaded: boolean }
 */
export function useFxRates(pollInterval = 60_000) {
  const [fxRates, setFxRates] = useState({});
  const [fxLoaded, setFxLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const arr = await apiFetch("/fxrates"); // сразу JSON
        const map = {};
        (arr || []).forEach((r) => {
          if (r?.currency) {
            map[String(r.currency).toUpperCase()] = Number(r.rate) || 0;
          }
        });
        if (mounted) {
          setFxRates(map);
          setFxLoaded(true);
        }
      } catch (e) {
        if (mounted) setFxLoaded(true);
      }
    };

    load();
    const id = setInterval(load, pollInterval);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [pollInterval]);

  return { fxRates, fxLoaded };
}

/** Formatting helpers */
export const formatNum = (n) => {
  if (n == null || !isFinite(n)) return "-";
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
};
export const formatRub = (v) => (v == null || !isFinite(v) ? "-" : `${formatNum(v)} ₽`);

/** Convert amount in currency -> RUB using fxRates map
 * - amount: number
 * - currency: string (SUR/RUB treated as RUB)
 * - fxRates: {CUR: rate}
 * returns number|null
 */
export const toRub = (amount, currency, fxRates = {}) => {
  if (amount == null) return null;
  const cur = (currency || "SUR").toString().toUpperCase();
  if (!cur || cur === "SUR" || cur === "RUB") return Number(amount);
  const rate = fxRates[cur];
  if (!rate || !isFinite(rate) || rate === 0) return null;
  return Number(amount) * Number(rate);
};

/**
 * computeTradesSumInRub(entries, fxRates)
 * - entries: number | {amount, currency} | Array<...>
 * - fxRates: map {CUR: rate}
 * returns { total: number, terms: string[] }
 *
 * Normalizes arrays/objects and converts non-RUB amounts when rate exists,
 * inserts human readable terms for debugging/traceability.
 */
export function computeTradesSumInRub(tradesSum, fxRates = {}) {
  const terms = [];
  let total = 0;

  if (tradesSum == null) {
    return { total: 0, terms };
  }

  if (typeof tradesSum === "number") {
    total = tradesSum;
    terms.push(`${formatRub(total)} (raw number assumed RUB)`);
    return { total, terms };
  }

  const entries = Array.isArray(tradesSum) ? tradesSum : [tradesSum];

  for (const item of entries) {
    if (!item) continue;
    try {
      if (typeof item === "number") {
        total += item;
        terms.push(`${formatRub(item)} (num)`);
        continue;
      }
      const amount =
        item.amount ??
        item.value ??
        (item.price != null && item.qty != null ? Number(item.price) * Number(item.qty) : null);
      const currency = (item.currency || item.currency_code || "SUR").toString().toUpperCase();
      if (amount == null) {
        terms.push(`0 (${JSON.stringify(item)})`);
        continue;
      }
      if (currency === "SUR" || currency === "RUB") {
        total += Number(amount);
        terms.push(`${formatRub(Number(amount))} (${currency})`);
      } else {
        const converted = toRub(amount, currency, fxRates);
        if (converted == null) {
          terms.push(`${Number(amount).toFixed(2)} ${currency}→(missing rate)`);
        } else {
          total += converted;
          terms.push(`${Number(amount).toFixed(2)} ${currency}→${formatRub(converted)}`);
        }
      }
    } catch (err) {
      terms.push(`err(${JSON.stringify(item)})`);
    }
  }

  return { total, terms };
}
