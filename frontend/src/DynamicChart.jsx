// frontend/src/DynamicChart.jsx
import React from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function DynamicChart({ bonds }) {
  // Преобразуем данные в [{ name, ytm }, …]
  const data = bonds.map(b => ({
    name: b.name,
    ytm: b.ytm,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <XAxis dataKey="name" />
        <YAxis unit="%" />
        <Tooltip formatter={(value) => `${value.toFixed(2)}%`} />
        <Line type="monotone" dataKey="ytm" stroke="#8884d8" />
      </LineChart>
    </ResponsiveContainer>
  );
}
