// frontend/src/FxRatesPanel.jsx
import React, { useEffect, useState } from "react";
import { apiFetch } from "./api";

export default function FxRatesPanel({ refreshInterval = 60000, apiPath = "/fxrates" }) {
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
      try {
        setLoading(true);
        const data = await apiFetch(apiPath); // сразу JSON
        if (!Array.isArray(data)) {
          setRates([]);
          return;
        }
        const normalized = data
          .map(r => ({
            currency: (r.currency ?? r.code ?? "").toString().toUpperCase(),
            rate: (r.rate == null || r.rate === "") ? null : Number(r.rate),
          }))
          .filter(x => x.currency);
        setRates(normalized);
      } catch (e) {
        console.warn("FxRatesPanel load failed", e);
        setRates([]);
      } finally {
        setLoading(false);
      }
    };


  useEffect(() => {
    let mounted = true;
    load();
    const id = setInterval(() => { if (mounted) load(); }, refreshInterval);
    return () => { mounted = false; clearInterval(id); };
  }, [refreshInterval, apiPath]);

  if (!rates || rates.length === 0) {
    return (
      <div className="fxrates-inline" aria-live="polite">
        {loading ? "Курсы: загрузка…" : "Курсы недоступны"}
      </div>
    );
  }

  return (
    <div className="fxrates-inline" aria-live="polite" title="Курсы валют (обновляются автоматически)">
      {rates.map((r, i) => (
        <span className="fxrates-item" key={r.currency}>
          <span className="fxrates-cur">{r.currency}</span>
          <span className="fxrates-val">{r.rate == null || Number.isNaN(r.rate) ? "-" : Number(r.rate).toLocaleString("ru-RU", { minimumFractionDigits: 4, maximumFractionDigits: 6 })}</span>
          {i < rates.length - 1 && <span className="fxrates-sep">·</span>}
        </span>
      ))}
    </div>
  );
}
