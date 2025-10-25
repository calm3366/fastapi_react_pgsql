import React from "react";

export default function UpBar({ query, setQuery, onSearch, onToggleRGBI }) {
  return (
    <div
      className="upbar-root"
      style={{
        margin: "16px 0",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}
    >
      {/* Поиск */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          id="bond-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSearch();
          }}
          placeholder="Поиск по названию"
          style={{
            width: 300,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            outline: "none",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,0.02)",
            fontSize: "0.95rem",
          }}
        />
        <button
          onClick={onSearch}
          className="btn btn-refresh enabled"
          style={{ padding: "8px 12px" }}
          aria-label="Поиск облигаций"
        >
          Поиск
        </button>
      </div>

      {/* Кнопка Индекса RGBI */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={() => onToggleRGBI(true)}
          className="btn btn-refresh enabled heading-accent header-appear"
          style={{
            background: "#0b72e3",
            color: "#fff",
            padding: "8px 12px",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: 600,
            boxShadow: "0 2px 8px rgba(11,114,227,0.12)",
          }}
          aria-pressed="false"
        >
          Индекс RGBI
        </button>
      </div>
    </div>
  );
}
