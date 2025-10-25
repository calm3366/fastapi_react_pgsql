// frontend/src/VolumePanel.jsx
import React, { useMemo, useState, useEffect } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export default function VolumePanel({ bonds }) {
  const [showChart, setShowChart] = useState(false);
  const [closing, setClosing] = useState(false);
  const [pieReady, setPieReady] = useState(false);
  const [fxRates, setFxRates] = useState({});

  useEffect(() => {
    let t;
    if (showChart) {
      t = setTimeout(() => setPieReady(true), 300);
    } else {
      setPieReady(false);
    }
    return () => clearTimeout(t);
  }, [showChart]);

  // load fx rates (map: USD -> RUB per 1)
  useEffect(() => {
    let mounted = true;
    const loadFx = async () => {
      try {
        const res = await fetch("/fxrates");
        if (!res.ok) throw new Error("fx fetch failed " + res.status);
        const arr = await res.json();
        const map = {};
        (arr || []).forEach(i => {
          if (i?.currency) map[String(i.currency).toUpperCase().trim()] = Number(i.rate) || 0;
        });
        if (mounted) setFxRates(map);
      } catch (e) {
        console.warn("Failed to load fx rates:", e);
      }
    };
    loadFx();
    const id = setInterval(loadFx, 60_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  const formatPercent = (n) =>
    n == null || !isFinite(n) ? "-" : `${n.toFixed(2)}%`;

  const formatRub = (v) =>
    v == null || !isFinite(v) ? "-" : `${Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;

  // helper to convert value in given currency to RUB
  const toRub = (value, currency) => {
    if (value == null) return null;
    const cur = (currency || "SUR")?.toUpperCase();
    if (!cur || cur === "SUR" || cur === "RUB") return Number(value);
    const rate = Number(fxRates?.[cur] ?? 0) || 0;
    return rate ? Number(value) * rate : null;
  };

  const { corpFix, corpFloat, ofz, fx, total, items } = useMemo(() => {
    if (!bonds || bonds.length === 0) {
      return { corpFix: 0, corpFloat: 0, ofz: 0, fx: 0, total: 0, items: [] };
    }

    const items = bonds.map(b => {
      const abs_value = b.abs_value != null ? Number(b.abs_value) : null;
      const abs_currency = b.abs_currency ? String(b.abs_currency).toUpperCase().trim() : null;
      const abs_value_in_rub = b.abs_value_in_rub != null ? Number(b.abs_value_in_rub) : null;

      const fallbackVal = (b.last_price != null && b.buy_qty != null)
        ? Number(b.last_price) * Number(b.buy_qty)
        : null;
      const fallbackCur = b.currency ? String(b.currency).toUpperCase().trim() : "SUR";

      const finalAbs = abs_value != null ? abs_value : fallbackVal;
      const finalCur = abs_value != null ? (abs_currency || fallbackCur) : fallbackCur;

      const finalAbsInRub = abs_value_in_rub != null
        ? abs_value_in_rub
        : (finalAbs != null ? toRub(finalAbs, finalCur) : null);

      return {
        bond: b,
        abs_value: finalAbs,
        abs_currency: finalCur,
        abs_value_in_rub: finalAbsInRub
      };
    });

    const totalInRub = items.reduce((s, it) => s + (it.abs_value_in_rub != null ? it.abs_value_in_rub : 0), 0);

    let corpFix = 0, corpFloat = 0, ofz = 0, fxSum = 0;

    items.forEach(it => {
      const b = it.bond;
      const v = it.abs_value_in_rub || 0;
      if (v === 0) return;

      if (b.currency && b.currency !== "SUR") {
        fxSum += v;
      } else if (b.name?.toUpperCase().includes("ОФЗ")) {
        ofz += v;
      } else if (b.coupon_type?.toUpperCase().includes("ФИКС")) {
        corpFix += v;
      } else if (b.coupon_type?.toUpperCase().includes("ФЛОАТ")) {
        corpFloat += v;
      } else {
        corpFix += v;
      }
    });

    return { corpFix, corpFloat, ofz, fx: fxSum, total: totalInRub, items };
  }, [bonds, fxRates]);

  // build data with percents for Pie labels
  const data = useMemo(() => {
    const list = [
      { name: "Корп. фиксы", value: corpFix, key: "corpFix" },
      { name: "Корп. флоатеры", value: corpFloat, key: "corpFloat" },
      { name: "ОФЗ", value: ofz, key: "ofz" },
      { name: "Валютные", value: fx, key: "fx" },
    ];
    const totalVal = list.reduce((s, x) => s + (x.value || 0), 0);
    return list.map(x => ({
      ...x,
      percent: totalVal > 0 ? ( (x.value || 0) / totalVal ) * 100 : 0
    }));
  }, [corpFix, corpFloat, ofz, fx]);

  const COLORS = ["#8884d8", "#82ca9d", "#ffc658", "#ff8042"];

  const handleClose = () => {
    setPieReady(false);
    setClosing(true);
    setTimeout(() => {
      setShowChart(false);
      setClosing(false);
    }, 300);
  };

  return (
    <div
      className="summary-panel"
      onMouseEnter={() => setShowChart(true)}
      onMouseLeave={handleClose}
      style={{ position: "relative" }}
    >
      <div className="summary-item corpFix">
        <label>Корп. фиксы:</label>
        <span>
          {formatPercent(total > 0 ? (corpFix / total) * 100 : null)} ({formatRub(corpFix)})
        </span>
      </div>
      <div className="summary-item corpFloat">
        <label>Корп. флоатеры:</label>
        <span>
          {formatPercent(total > 0 ? (corpFloat / total) * 100 : null)} ({formatRub(corpFloat)})
        </span>
      </div>
      <div className="summary-item ofz">
        <label>ОФЗ:</label>
        <span>
          {formatPercent(total > 0 ? (ofz / total) * 100 : null)} ({formatRub(ofz)})
        </span>
      </div>
      <div className="summary-item fx">
        <label>Валютные:</label>
        <span>
          {formatPercent(total > 0 ? (fx / total) * 100 : null)} ({formatRub(fx)})
        </span>
      </div>

      {showChart && (
        <div
          className={`rgbi-chart-wrapper ${closing ? "hide" : ""}`}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            width: "100%",
            zIndex: 3000,            // <- обеспечить высокий слой для всего wrapper
            pointerEvents: "auto",   // <- обеспечить события мыши на диаграмме
          }}
        >
          <div
            className="rgbi-chart-container"
            style={{
              height: 300,
              background: "#fff",
              border: "1px solid #ccc",
              zIndex: 3001,           // <- ещё выше для контейнера
              padding: "10px",
              position: "relative",
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            }}
          >
            {/* затемняющие зоны слева/справа — оставляем, но они не должны перекрывать диаграмму */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "30%",
                height: "100%",
                background: "rgba(0,0,0,0.05)",
                zIndex: 3002,
                cursor: "pointer",
              }}
              onMouseEnter={handleClose}
            />
            <div
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                width: "30%",
                height: "100%",
                background: "rgba(0,0,0,0.05)",
                zIndex: 3002,
                cursor: "pointer",
              }}
              onMouseEnter={handleClose}
            />

            {pieReady && !closing && (
              <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      key={`pie-${corpFix}-${corpFloat}-${ofz}-${fx}-${total}-${pieReady}`}
                      data={data}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      isAnimationActive={true}
                      animationDuration={800}
                      animationBegin={0}
                      animationEasing="ease-out"
                      label={(entry) => `${entry.name}: ${entry.percent.toFixed(0)}%`}
                    >
                      {data.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val) =>
                        `${val.toLocaleString("ru-RU", {
                          maximumFractionDigits: 2,
                        })} ₽`
                      }
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
