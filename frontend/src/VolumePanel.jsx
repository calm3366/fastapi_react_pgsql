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
  const [pieReady, setPieReady] = useState(false); // маунтим Pie после анимации обёртки

  useEffect(() => {
    let t;
    if (showChart) {
      // ждём завершения slideDown (300 мс), затем маунтим Pie
      t = setTimeout(() => setPieReady(true), 300);
    } else {
      setPieReady(false);
    }
    return () => clearTimeout(t);
  }, [showChart]);

  const formatPercent = (n) =>
    n == null ? "-" : `${n.toFixed(2)}%`;

  const { corpFix, corpFloat, ofz, fx, total } = useMemo(() => {
    if (!bonds || bonds.length === 0) {
      return { corpFix: 0, corpFloat: 0, ofz: 0, fx: 0, total: 0 };
    }

    const total = bonds.reduce(
      (sum, b) => sum + (b.last_price ?? 0) * (b.buy_qty ?? 0),
      0
    );

    let corpFix = 0, corpFloat = 0, ofz = 0, fx = 0;

    bonds.forEach(b => {
      const value = (b.last_price ?? 0) * (b.buy_qty ?? 0);
      if (value === 0) return;

      if (b.currency && b.currency !== "SUR") {
        fx += value;
      } else if (b.name?.toUpperCase().includes("ОФЗ")) {
        ofz += value;
      } else if (b.coupon_type?.toUpperCase().includes("ФИКС")) {
        corpFix += value;
      } else if (b.coupon_type?.toUpperCase().includes("ФЛОАТ")) {
        corpFloat += value;
      }
    });

    return { corpFix, corpFloat, ofz, fx, total };
  }, [bonds]);

  const data = [
    { name: "Корп. фиксы", value: corpFix, key: "corpFix" },
    { name: "Корп. флоатеры", value: corpFloat, key: "corpFloat" },
    { name: "ОФЗ", value: ofz, key: "ofz" },
    { name: "Валютные", value: fx, key: "fx" },
  ];

  const COLORS = ["#8884d8", "#82ca9d", "#ffc658", "#ff8042"];

  const handleClose = () => {
    setPieReady(false);     // сразу размонтируем Pie
    setClosing(true);
    setTimeout(() => {
      setShowChart(false);
      setClosing(false);
    }, 300); // длительность slideUp
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
          {formatPercent((corpFix / total) * 100)} ({corpFix.toLocaleString()} ₽)
        </span>
      </div>
      <div className="summary-item corpFloat">
        <label>Корп. флоатеры:</label>
        <span>
          {formatPercent((corpFloat / total) * 100)} ({corpFloat.toLocaleString()} ₽)
        </span>
      </div>
      <div className="summary-item ofz">
        <label>ОФЗ:</label>
        <span>
          {formatPercent((ofz / total) * 100)} ({ofz.toLocaleString()} ₽)
        </span>
      </div>
      <div className="summary-item fx">
        <label>Валютные:</label>
        <span>
          {formatPercent((fx / total) * 100)} ({fx.toLocaleString()} ₽)
        </span>
      </div>

      {showChart && (
        <div
          className={`rgbi-chart-wrapper ${closing ? "hide" : ""}`}
          style={{ position: "absolute", top: "100%", left: 0, width: "100%" }}
        >
          <div
            className="rgbi-chart-container"
            style={{
              height: 300,
              background: "#fff",
              border: "1px solid #ccc",
              zIndex: 10,
              padding: "10px",
              position: "relative",
            }}
          >
            {/* зоны для скрытия */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "30%",
                height: "100%",
                background: "rgba(0,0,0,0.05)",
                zIndex: 20,
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
                zIndex: 20,
                cursor: "pointer",
              }}
              onMouseEnter={handleClose}
            />

            {/* Маунтим Pie только после завершения slideDown */}
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
                    label={({ name, value }) =>
                      `${name}: ${value.toLocaleString("ru-RU", {
                        maximumFractionDigits: 2,
                      })} ₽`
                    }
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
