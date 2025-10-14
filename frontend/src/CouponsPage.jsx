// frontend/src/CouponsPage.jsx
import React, { useEffect, useState, useRef } from "react";

export default function CouponsPage() {
  const [coupons, setCoupons] = useState([]);
  const listRef = useRef(null);

  useEffect(() => {
    fetch("http://localhost:8010/coupons")
      .then((res) => res.json())
      .then((data) => setCoupons(Array.isArray(data) ? data : []))
      .catch((err) => console.error("Ошибка загрузки купонов:", err));
  }, []);

  useEffect(() => {
    if (coupons.length > 0 && listRef.current) {
      const futureIndex = coupons.findIndex(c => !c.is_past);
      if (futureIndex !== -1) {
        const listEl = listRef.current;
        const itemEl = listEl.querySelectorAll("li")[futureIndex];
        if (itemEl) {
          // используем scrollIntoView с опцией "center"
          itemEl.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }
    }
  }, [coupons]);

  return (
    <>
      <div className="panel-header">График купонов</div>
      <div
        className="coupon-list"
        ref={listRef}
        style={{ maxHeight: "400px", overflowY: "auto" }}
      >
        <ul style={{ listStyle: "none", padding: 0, marginTop: 8 }}>
          {coupons.map((coupon) => (
            <li
                key={coupon.id}
                style={{ color: coupon.is_past ? "green" : "gray" }}
                >
                {new Date(coupon.date).toLocaleDateString("ru-RU")} —{" "}
                <strong>{coupon.bond_name}</strong> —{" "}
                {coupon.payout == null ? "-" : coupon.payout.toFixed(2)}{" "}
                {coupon.currency || "RUB"}
            </li>
          ))}
          {coupons.length === 0 && (
            <li style={{ color: "#888" }}>Нет данных о купонах</li>
          )}
        </ul>
      </div>
    </>
  );
}
