// frontend/src/TradeModal.jsx
import React, { useState } from "react";
import { apiFetch } from "./api";
import Modal from "react-modal";

Modal.setAppElement("#root");

export default function TradeModal({
  bond,
  onClose,
  showToast,
  loadSummary,
  loadPositions,
  loadCoupons,
  addLog
}) {
  const [formData, setFormData] = useState({
    buy_date: "",
    buy_price: "",
    buy_qty: "",
    buy_nkd: "",
    buy_commission: "",
    sell_date: "",
    sell_price: "",
    sell_qty: "",
    sell_nkd: "",
    sell_commission: "",
    fx_rate: ""
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({
      buy_date: "",
      buy_price: "",
      buy_qty: "",
      buy_nkd: "",
      buy_commission: "",
      sell_date: "",
      sell_price: "",
      sell_qty: "",
      sell_nkd: "",
      sell_commission: "",
      fx_rate: ""
    });
  };

  const handleSubmit = async () => {
    if (!bond) return;

    const payload = {
      bond_id: bond.id,
      bond_name: bond.name,
      ...Object.fromEntries(
        Object.entries(formData).map(([key, value]) => [
          key,
          value === "" ? null : (
            // numeric fields -> cast to Number, dates remain strings
            ["buy_price","buy_qty","buy_nkd","buy_commission","sell_price","sell_qty","sell_nkd","sell_commission","fx_rate"].includes(key)
              ? Number(value)
              : value
          )
        ])
      )
    };

    try {
      await apiFetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      resetForm();
      showToast("Сделка успешно сохранена", "success");

      if (loadSummary) loadSummary();
      if (loadPositions) await loadPositions();
      if (loadCoupons) await loadCoupons();

      window.dispatchEvent(new Event("trades-updated"));
      addLog(`Добавлена сделка по ${bond.name}`);

      onClose();
    } catch (err) {
      console.error("Ошибка при сохранении сделки", err);
      showToast("Ошибка при сохранении сделки", "error");
    }
  };

  return (
    <Modal
      isOpen={true}
      onRequestClose={onClose}
      contentLabel="Сделка"
      style={{ content: { maxWidth: "600px", margin: "auto" } }}
    >
      <h2>{bond?.name}</h2>

      <h3>Покупка</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <input type="date" name="buy_date" value={formData.buy_date} onChange={handleChange} />
        <input type="number" step="0.01" name="buy_price" placeholder="Цена" value={formData.buy_price} onChange={handleChange} />
        <input type="number" name="buy_qty" placeholder="Количество" value={formData.buy_qty} onChange={handleChange} />
        <input type="number" step="0.01" name="buy_nkd" placeholder="НКД" value={formData.buy_nkd} onChange={handleChange} />
        <input type="number" step="0.01" name="buy_commission" placeholder="Комиссия (руб/валюта)" value={formData.buy_commission} onChange={handleChange} />
      </div>

      <h3 style={{ marginTop: 12 }}>Продажа</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <input type="date" name="sell_date" value={formData.sell_date} onChange={handleChange} />
        <input type="number" step="0.01" name="sell_price" placeholder="Цена" value={formData.sell_price} onChange={handleChange} />
        <input type="number" name="sell_qty" placeholder="Количество" value={formData.sell_qty} onChange={handleChange} />
        <input type="number" step="0.01" name="sell_nkd" placeholder="НКД" value={formData.sell_nkd} onChange={handleChange} />
        <input type="number" step="0.01" name="sell_commission" placeholder="Комиссия (руб/валюта)" value={formData.sell_commission} onChange={handleChange} />
      </div>

      <h3 style={{ marginTop: 12 }}>Курс на момент сделки (необязательно)</h3>
      <input
        type="number"
        step="0.0001"
        name="fx_rate"
        placeholder="Курс к рублю (пример 80.9834)"
        value={formData.fx_rate}
        onChange={handleChange}
      />

      <div style={{ marginTop: 16 }}>
        <button onClick={handleSubmit}>OK</button>
        <button onClick={onClose} style={{ marginLeft: 8 }}>Отмена</button>
      </div>
    </Modal>
  );
}
