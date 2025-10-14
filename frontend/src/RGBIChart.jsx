// frontend/src/RGBIChart.jsx
import React, { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceDot, 
} from "recharts";

function toMidnightTs(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function normalizeSeries(rows) {
  const map = new Map();
  for (const r of rows) {
    const dayTs = toMidnightTs(r.date);
    map.set(dayTs, { date: dayTs, value: Number(r.value) });
  }
  return Array.from(map.values())
    .filter((r) => Number.isFinite(r.value))
    .sort((a, b) => a.date - b.date);
}

// --- базовый fetch ---
async function fetchRGBIData({ from, to, limit = 500 }) {
  let start = 0;
  let allRows = [];
  let hasMore = true;

  while (hasMore) {
    const url = new URL(
      "https://iss.moex.com/iss/history/engines/stock/markets/index/boards/SNDX/securities/RGBI.json"
    );
    if (from) url.searchParams.set("from", from);
    if (to) url.searchParams.set("till", to);
    url.searchParams.set("start", start);
    url.searchParams.set("limit", limit);

    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Ошибка загрузки: ${resp.status}`);
    const json = await resp.json();

    const rows = (json.history?.data || []).map((row) => ({
      date: new Date(row[2]).getTime(),
      value: Number(row[5]),
    }));
    allRows = allRows.concat(rows);

    const cursor = json["history.cursor"];
    if (!cursor || !cursor.data || cursor.data.length === 0) {
      hasMore = false;
    } else {
      const total = Number(cursor.data[0][1]);
      start += limit;
      hasMore = start < total;
    }
  }

  return normalizeSeries(allRows);
}

// --- выборка для year каждые 14 дней ---
async function fetchRGBIYearSampled() {
  const now = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);

  const stepDays = 14;
  const stepMs = stepDays * 24 * 3600 * 1000;
  const points = [];

  for (let ts = startDate.getTime(); ts <= now.getTime(); ts += stepMs) {
    const dateStr = new Date(ts).toISOString().slice(0, 10);
    const url = new URL(
      "https://iss.moex.com/iss/history/engines/stock/markets/index/boards/SNDX/securities/RGBI.json"
    );
    url.searchParams.set("from", dateStr);
    url.searchParams.set("limit", "1");
    const resp = await fetch(url);
    if (resp.ok) {
      const json = await resp.json();
      const row = json.history?.data?.[0];
      if (row) {
        points.push({
          date: new Date(row[2]).getTime(),
          value: Number(row[5]),
        });
      }
    }
  }

  return normalizeSeries(points);
}

// --- выборка для all чанками по 60 дней ---
async function fetchRGBIHistoryByChunks(startDate, endDate, chunkDays = 60) {
  let rows = [];
  let cursor = new Date(startDate);

  while (cursor <= endDate) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + chunkDays);
    if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());

    const fromStr = cursor.toISOString().slice(0, 10);
    const toStr = chunkEnd.toISOString().slice(0, 10);

    const part = await fetchRGBIData({ from: fromStr, to: toStr });
    rows = rows.concat(part);

    cursor = new Date(chunkEnd);
    cursor.setDate(cursor.getDate() + 1);
  }

  return normalizeSeries(rows);
}

// --- downsample каждые N дней ---
function downsampleEveryNth(fullRows, stepDays = 30) {
  if (!fullRows.length) return [];
  const out = [];
  let lastTs = 0;
  const stepMs = stepDays * 24 * 3600 * 1000;

  for (const row of fullRows) {
    if (row.date - lastTs >= stepMs) {
      out.push(row);
      lastTs = row.date;
    }
  }
  // гарантируем, что последняя точка попадёт
  if (out[out.length - 1].date !== fullRows[fullRows.length - 1].date) {
    out.push(fullRows[fullRows.length - 1]);
  }
  return out;
}

// --- добавляем хвост до сегодняшнего дня ---
function extendWithLastValue(rows, maxDays = 10) {
  if (!rows.length) return rows;
  const last = rows[rows.length - 1];
  const today = toMidnightTs(Date.now());

  if (last.date >= today) return rows;

  for (let i = 0; i < maxDays; i++) {
    const d = toMidnightTs(today - i * 24 * 3600 * 1000);
    if (rows.some(r => r.date === d)) {
      return rows; // уже есть данные за этот день
    }
    if (d > last.date) {
      return normalizeSeries([...rows, { date: d, value: last.value }]);
    }
  }

  return rows;
}

export default function RGBIChart() {
  const [range, setRange] = useState("month");
  const [data, setData] = useState([]);

  useEffect(() => {
    async function load() {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      let rows = [];

      if (range === "day") {
        rows = await fetchRGBIData({ from: todayStr, to: todayStr });
      } else if (range === "week" || range === "month") {
        let fromDate = new Date(now);
        if (range === "week") fromDate.setDate(fromDate.getDate() - 7);
        if (range === "month") fromDate.setMonth(fromDate.getMonth() - 1);
        const fromStr = fromDate.toISOString().slice(0, 10);
        rows = await fetchRGBIData({ from: fromStr, to: todayStr });
      } else if (range === "year") {
        rows = await fetchRGBIYearSampled();
      } else if (range === "all") {
        const startDate = new Date("2012-03-01");
        const endDate = new Date();
        const full = await fetchRGBIHistoryByChunks(startDate, endDate, 60);
        rows = downsampleEveryNth(full, 30);
        rows = extendWithLastValue(rows, 10);
      }

      setData(rows);
    }

    load();
  }, [range]);

  const now = toMidnightTs(Date.now());
  const yearAgo = toMidnightTs(
    new Date(new Date().setFullYear(new Date().getFullYear() - 1))
  );
  const minDate = data.length ? data[0].date : yearAgo;

  // Кастомный рендерер точек: метки только для первой и последней,
  // с умным смещением по локальному наклону, без пересечения с линией.
  const StartEndDot = (props) => {
    const { cx, cy, index, data, payload, stroke, x, y } = props;
    const isStart = index === 0;
    const isEnd = index === data.length - 1;
    if (!isStart && !isEnd) return null;

    const value = Number(payload.value);
    const dateStr = new Date(payload.date).toLocaleDateString("ru-RU");
    const label = `${value.toFixed(2)}`;

    // оценка локального наклона: берем соседние точки
    const prev = index > 0 ? data[index - 1] : null;
    const next = index < data.length - 1 ? data[index + 1] : null;

    // базовые смещения
    let dx = isStart ? 10 : 10; // горизонтальное смещение внутрь графика
    let dy = -10;               // вертикально вверх по умолчанию
    let textAnchor = "start";   // текст справа от точки

    // если линия сверху, уводим подпись вниз, чтобы не наезжать
    if (prev && next) {
      const slope = (next.value - prev.value) / (next.date - prev.date); // наклон
      // при положительном наклоне ставим подпись ниже, при отрицательном — выше
      dy = slope > 0 ? 14 : -14;
    } else if (prev) {
      const slope = (value - prev.value) / (payload.date - prev.date);
      dy = slope > 0 ? 14 : -14;
    } else if (next) {
      const slope = (next.value - value) / (next.date - payload.date);
      dy = slope > 0 ? -14 : 14;
    }

    // чуть сильнее уводим подпись от точки концов
    if (isStart) {
      dx = 12;
      textAnchor = "start";
    }
    if (isEnd) {
      dx = 12;
      textAnchor = "start";
    }

    // Координаты текста
    const tx = cx + dx;
    const ty = cy + dy;

    // Белая подложка под текст для читаемости
    return (
      <g>
        <circle cx={cx} cy={cy} r={4} fill={stroke || "#0077cc"} />
        <rect
          x={tx - 2}
          y={ty - 12}
          width={label.length * 6.4} // приблизительная ширина
          height={16}
          fill="rgba(255,255,255,0.9)"
          stroke="none"
          rx={3}
        />
        <text
          x={tx}
          y={ty}
          fontSize={12}
          fill={stroke || "#0077cc"}
          textAnchor={textAnchor}
          dominantBaseline="middle"
        >
          {label}
        </text>
      </g>
    );
  };

  return (
    <div style={{ width: "100%", height: "100%", background: "#fff", padding: 16 }}>
      <div style={{ marginBottom: 8 }}>
        {["day", "week", "month", "year", "all"].map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            style={{
              marginRight: 8,
              padding: "6px 12px",
              background: range === r ? "#0077cc" : "#eee",
              color: range === r ? "#fff" : "#000",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {r}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height="85%">
        <LineChart data={data} margin={{ top: 30, right: 70, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#ccc" />
          <XAxis
            dataKey="date"
            type="number"
            domain={
              range === "year"
                ? [yearAgo, now]
                : range === "all"
                ? [minDate, now]
                : ["dataMin", "dataMax"]
            }
            tickFormatter={(ts) => {
              const d = new Date(ts);
              return range === "day"
                ? d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
                : d.toLocaleDateString("ru-RU");
            }}
          />
          <YAxis domain={["dataMin", "dataMax"]} allowDecimals />
          <Tooltip
            labelFormatter={(ts) => {
              const d = new Date(ts);
              return range === "day"
                ? d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
                : d.toLocaleDateString("ru-RU");
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#0077cc"
            dot={<StartEndDot data={data} />}
            activeDot={false}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
