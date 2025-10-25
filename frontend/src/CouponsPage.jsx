import React, { useEffect, useRef } from "react";

const CURRENCY_SYMBOLS = {
  RUB: "₽",
  SUR: "₽",
  USD: "$",
  CNY: "¥",
  CNH: "¥",
  EUR: "€",
  GBP: "£",
};

export default function CouponsPage({ coupons = [], loadCoupons }) {
  const listRef = useRef(null);

  useEffect(() => {
    loadCoupons();
  }, []);

  useEffect(() => {
    if (coupons.length > 0 && listRef.current) {
      const futureIndex = coupons.findIndex(c => !c.is_past);
      if (futureIndex !== -1) {
        const listEl = listRef.current;
        const itemEl = listEl.querySelectorAll("li")[futureIndex];
        if (itemEl) {
          itemEl.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }
    }
  }, [coupons]);

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("ru-RU") : "-";
  const fmtNum = (n) => (n == null || !isFinite(Number(n)) ? "-" : Number(n).toFixed(2));

  const currencySymbol = (code) => {
    if (!code) return "₽";
    const up = String(code).toUpperCase();
    return CURRENCY_SYMBOLS[up] ?? up;
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
          padding: "1px 0",
        }}
      >
        <h3 className="heading-accent" style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.02 }}>
          График купонов
        </h3>
      </div>

      <div
        className="coupon-list compact-small"
        ref={listRef}
        style={{ maxHeight: "400px", overflowY: "auto", paddingTop: 6 }}
      >
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {coupons.length === 0 && (
            <li style={{ padding: "0px 0px", color: "#666", lineHeight: 1.02 }}>Нет данных о купонах</li>
          )}

          {coupons.map((coupon) => {
            const sym = currencySymbol(coupon.currency);
            return (
              <li
                key={coupon.id}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "baseline",
                  padding: "1px 0px",
                  borderRadius: 6,
                  lineHeight: 1.02,
                  color: coupon.is_past ? "green" : "gray",
                  fontSize: "0.75rem",
                }}
                title={`${coupon.bond_name} — ${coupon.payout ?? "-"} ${coupon.currency || "RUB"}`}
              >
                <div style={{ minWidth: 66, fontSize: "0.75rem", color: "#6b7280" }}>
                  {fmtDate(coupon.date)}
                </div>
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: "0.75rem", display: "inline-block", marginRight: 6, minWidth: 80 }}>
                    {coupon.bond_name}
                  </strong>
                  <span style={{ color: "#111" }}>
                    — &ensp; {coupon.payout == null ? "-" : fmtNum(coupon.payout)} {sym}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
