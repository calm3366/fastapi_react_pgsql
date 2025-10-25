// frontend/src/BondsPage.jsx
import React, { useState, useEffect, useMemo } from "react";
import { apiFetch } from "./api";
import Modal from "react-modal";
import BondsTable from "./BondsTable";
import TradeModal from "./TradeModal";
import UpBar from "./UpBar";
import { useToastContext } from "./hooks";

import { parseNumber, parseCandidates, getCategory } from "./BondRowHelpers";
import { computeMergedBonds } from "./BondsDataHelpers";

Modal.setAppElement("#root");

export default function BondsPage(props) {
  const {
    query,
    setQuery,
    results = [],
    bonds = [],
    onSearch,
    onAdd,
    onDeleteSelected,
    onRefreshAll,
    lastUpdateTime,
    onCreateTrade,
    addLog,
    loadSummary,
    loadPositions,
    loadCoupons,
    onToggleRGBI,
    loadBonds, 
  } = props;

 
  const [selectedIds, setSelectedIds] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeBond, setActiveBond] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState(0);

  const [bondsWithWeights, setBondsWithWeights] = useState([]);
  const [fxRates, setFxRates] = useState({});
  const [positionsByBond, setPositionsByBond] = useState({});
  const [tradesByBond, setTradesByBond] = useState({});
  const { toast, showToast } = useToastContext();

  const formatPrice = (value, currency) => {
    if (value == null) return "-";
    if (!currency || currency === "SUR") {
      return Number(value).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "CNY" ? "¥" : currency;
    return `${Number(value).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbol}`;
  };

  useEffect(() => {
    let mounted = true;
    const loadWeights = async () => {
      try {
        const res = await apiFetch("/bonds/weights");
        if (!res.ok) return;
        const data = await res.json();
        if (mounted) setBondsWithWeights(Array.isArray(data) ? data : []);
      } catch (e) {
        if (mounted) setBondsWithWeights([]);
      }
    };
    loadWeights();
    const id = setInterval(() => {
      loadWeights();
      if (onRefreshAll) onRefreshAll();
      if (loadSummary) loadSummary();
    }, 60_000);
    return () => { mounted = false; clearInterval(id); };
  }, [onRefreshAll, loadSummary]);

  useEffect(() => {
    let mounted = true;
    const loadFx = async () => {
      try {
        const res = await apiFetch("/fxrates");
        if (!res.ok) throw new Error("fx fetch failed");
        const arr = await res.json();
        const map = {};
        (arr || []).forEach(item => {
          if (item && item.currency) map[String(item.currency).toUpperCase().trim()] = Number(item.rate) || 0;
        });
        if (mounted) setFxRates(map);
      } catch (e) {
        if (mounted) setFxRates({});
      }
    };
    loadFx();
    const id = setInterval(loadFx, 60_000);
    return () => { mounted = false; clearInterval(id); };
  }, [lastUpdateTime]);

  useEffect(() => {
    let mounted = true;
    const loadPositionsApi = async () => {
      try {
        const res = await apiFetch("/positions");
        if (!res.ok) {
          if (mounted) setPositionsByBond({});
          return;
        }
        const arr = await res.json();
        const map = {};
        (arr || []).forEach(p => {
          const id = String(p.bond_id ?? p.id ?? p.secid ?? "");
          if (!id) return;
          map[id] = p;
        });
        if (mounted) setPositionsByBond(map);
      } catch (e) {
        if (mounted) setPositionsByBond({});
      }
    };
    loadPositionsApi();
    const id = setInterval(loadPositionsApi, 60_000);
    return () => { mounted = false; clearInterval(id); };
  }, [lastUpdateTime]);

  useEffect(() => {
    let mounted = true;

    const parseNum = (v) => {
      if (v == null) return null;
      if (typeof v === "number") return v;
      const s = String(v).trim().replace(",", ".").replace(/\s+/g, "");
      const n = Number(s.replace(/[^\d\.\-]/g, ""));
      return Number.isFinite(n) ? n : null;
    };

    const normalizeArrayToMap = (arr) => {
      const map = {};
      (arr || []).forEach(item => {
        const id = String(item.bond_id ?? item.bond?.id ?? item.bondId ?? item.id ?? "");
        if (!id) return;
        map[id] = map[id] || { amount: 0, qty: 0 };
        if (item.total_amount != null) map[id].amount = (map[id].amount || 0) + Number(item.total_amount);
        else if (item.amount != null) map[id].amount = (map[id].amount || 0) + Number(item.amount);

        const buyQtyRaw = item.buy_qty ?? item.qty ?? item.quantity ?? 0;
        const sellQtyRaw = item.sell_qty ?? 0;
        const buyQty = parseNum(buyQtyRaw) || 0;
        const sellQty = parseNum(sellQtyRaw) || 0;
        if (buyQty) map[id].qty = (map[id].qty || 0) + buyQty;
        if (sellQty) map[id].qty = (map[id].qty || 0) - sellQty;

        const priceRaw = item.buy_price ?? item.sell_price ?? item.price ?? item.last_price ?? null;
        const price = parseNum(priceRaw);
        if ((!map[id].amount || map[id].amount === 0) && price != null && (buyQty || parseNum(item.qty) || parseNum(item.buy_qty))) {
          const q = buyQty || parseNum(item.qty) || parseNum(item.buy_qty) || 0;
          map[id].amount = (map[id].amount || 0) + price * q + (parseNum(item.buy_nkd) || 0) + (parseNum(item.sell_nkd) || 0);
        }
        if (price != null) map[id].last_price = price;
      });
      Object.keys(map).forEach(k => {
        const v = map[k];
        if ((v.amount == null || v.amount === 0) && (v.qty == null || v.qty === 0) && !v.last_price) {
          delete map[k];
        }
      });
      return map;
    };

    const loadTradesAgg = async () => {
      try {
        const tried = [
          "/api/trades",
          "/api/trades_breakdown"
        ];
        let finalMap = {};
        for (const ep of tried) {
          try {
            const data = await apiFetch(ep); // apiFetch уже вернёт JSON
            if (Array.isArray(data)) {
              const map = normalizeArrayToMap(data);
              if (Object.keys(map).length > 0) { finalMap = map; break; }
            } else if (data && typeof data === "object") {
              if (Array.isArray(data.positions) && data.positions.length > 0) {
                const map = normalizeArrayToMap(data.positions);
                if (Object.keys(map).length > 0) { finalMap = map; break; }
              }
              const keys = Object.keys(data || {});
              if (keys.length > 0 && typeof data[keys[0]] === "object") {
                const map = {};
                for (const k of keys) {
                  const v = data[k];
                  if (!v) continue;
                  map[String(k)] = {
                    amount: v.amount != null ? Number(v.amount) : (v.total_amount != null ? Number(v.total_amount) : undefined),
                    qty: v.qty != null ? Number(v.qty) : (v.buy_qty != null ? Number(v.buy_qty) : undefined),
                    last_price: v.last_price != null ? Number(v.last_price) : (v.price != null ? Number(v.price) : undefined)
                  };
                }
                if (Object.keys(map).length > 0) { finalMap = map; break; }
              }
            }
          } catch (e) {
            continue;
          }
        }
        if (mounted) {
          setTradesByBond(finalMap);
        }
      } catch (err) {
        if (mounted) setTradesByBond({});
      }
    };

    loadTradesAgg();
    const id = setInterval(loadTradesAgg, 60_000);
    return () => { mounted = false; clearInterval(id); };
  }, [lastUpdateTime]);

  const normalizedBonds = useMemo(() => {
    const coerce = (v) => {
      if (v == null) return null;
      if (typeof v === "number" && isFinite(v)) return Number(v);
      try {
        const s = String(v).trim().replace(/\s+/g, "").replace(/,/g, ".").replace(/[^\d\.\-]/g, "");
        const n = Number(s);
        return Number.isFinite(n) ? n : null;
      } catch (e) {
        return null;
      }
    };
    return (bonds || []).map(b => ({ ...b, last_price: coerce(b.last_price ?? b.price ?? b.market_price ?? null) }));
  }, [bonds]);


  const mergedBonds = useMemo(() => {
    return computeMergedBonds(normalizedBonds, bondsWithWeights, fxRates, formatPrice, positionsByBond, tradesByBond);
  }, [normalizedBonds, bondsWithWeights, fxRates, positionsByBond, tradesByBond, formatPrice]);

  useEffect(() => {
    const handler = (ev) => {
      console.debug("bonds-updated event received", ev?.detail);
      try { if (typeof loadSummary === "function") loadSummary(); } catch(e) { console.warn(e); }
      try { if (typeof loadPositions === "function") loadPositions(); } catch(e) { console.warn(e); }
      try { if (typeof loadBonds === "function") loadBonds(); } catch(e) { console.warn(e); }   // <- important
      try { if (typeof loadCoupons === "function") loadCoupons(); } catch(e) { console.warn(e); }
    };
    window.addEventListener("bonds-updated", handler);
    return () => window.removeEventListener("bonds-updated", handler);
  }, [loadSummary, loadPositions, loadCoupons, loadBonds]);


  const handleDelete = () => {
    if (selectedIds.length > 0) {
      onDeleteSelected(selectedIds);
      setSelectedIds([]);
      if (loadSummary) loadSummary();
    }
  };

  const formatDate = (dt) => {
    if (!dt) return "-";
    const d = new Date(dt);
    if (isNaN(d)) return "-";
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = String(d.getFullYear()).padStart(4, "0");
    return `${day}.${month}.${year}`;
  };


  const handleRowClick = (event, bond) => {
    const target = event.target;
    if (
      (target.tagName.toLowerCase() === "input" && target.type === "checkbox") ||
      (target.tagName.toLowerCase() === "td" && target.querySelector('input[type="checkbox"]'))
    ) {
      return;
    }
    setActiveBond(bond);
    setModalOpen(true);
  };

  const handleRefreshClick = async () => {
    setRefreshing(true);
    setProgress(0);
    const interval = setInterval(() => { setProgress(prev => (prev >= 90 ? prev : prev + 10)); }, 300);
    try {
      if (onRefreshAll) await onRefreshAll();
      if (loadSummary) await loadSummary();
      setProgress(100);
    } catch (err) {
      console.error("Ошибка обновления", err);
    } finally {
      clearInterval(interval);
      setTimeout(() => { setRefreshing(false); setProgress(0); }, 500);
    }
  };

  const CATEGORY_COLORS = {
    corpFix: "#8884d8",
    corpFloat: "#82ca9d",
    ofz: "#ffc658",
    fx: "#ff8042",
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === bonds.length) setSelectedIds([]);
    else setSelectedIds(bonds.map(b => b.id));
  };

  return (
  <div className="bonds-page-root" style={{ padding: 8, fontFamily: "sans-serif" }}>
    <div className="page-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 className="heading-accent header-appear" style={{ margin: 0 }}>Монитор облигаций</h1>
      </div>
    </div>
    <UpBar
      query={query}
      setQuery={setQuery}
      onSearch={onSearch}
      onToggleRGBI={onToggleRGBI}
    />
    {results.length > 0 && (
      <div style={{ marginBottom: 24 }}>
        <div className="panel-header header-appear" style={{ alignItems: "center", gap: 8 }}>
          <h2 className="heading-accent" style={{ margin: 0 }}>Результаты поиска</h2>
        </div>

        <ul style={{ listStyle: "none", padding: 0, marginTop: 8 }}>
          {results.map(b => (
            <li key={b.secid} style={{ marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <strong style={{ fontSize: "0.95rem" }}>{b.secid}</strong>
                <span style={{ color: "#333" }}>{b.name}</span>
                <span style={{ color: "#666" }}>({b.coupon ?? "-"}%)</span>
              </div>
              <div>
                <button className="btn btn-refresh enabled" onClick={() => onAdd(b.secid)} style={{ padding: "4px 8px" }}>Добавить</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    )}

    <hr style={{ border: "none", borderTop: "1px solid #e6e6e6", margin: "12px 0" }} />

    <BondsTable
      mergedBonds={mergedBonds}
      formatPrice={formatPrice}
      lastUpdateTime={lastUpdateTime}
      onRowClick={(bond) => { setActiveBond(bond); setModalOpen(true); }}
      formatDate={formatDate}
      getCategory={getCategory}
      CATEGORY_COLORS={CATEGORY_COLORS}
      toggleSelectAll={toggleSelectAll}
      handleRowClick={handleRowClick}
      toggleSelect={toggleSelect}
      selectedIds={selectedIds}
      handleDelete={handleDelete}
      handleRefreshClick={handleRefreshClick}
      refreshing={refreshing}
      progress={progress}
    />

    {modalOpen && activeBond && (
      <TradeModal
        bond={activeBond}
        onClose={() => setModalOpen(false)}
        showToast={showToast}
        loadSummary={loadSummary}
        loadPositions={loadPositions}
        loadCoupons={loadCoupons}
        addLog={addLog}
      />
    )}

    {toast.message && (
      <div
        style={{
          position: "fixed",
          top: 20,
          right: 20,
          background: toast.type === "success" ? "green" : "red",
          color: "white",
          padding: "10px 16px",
          borderRadius: 4,
          boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
          zIndex: 9999
        }}
      >
        {toast.message}
      </div>
    )}
  </div>
);
}
