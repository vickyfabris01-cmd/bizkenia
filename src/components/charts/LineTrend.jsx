// src/components/charts/LineTrend.jsx — NEW FILE
//
// AIM
// A line chart for "how a number changes over time" (income over the months, collections, yield).
// Colours come from the chart tokens. Added in Phase 4 and meant to be reused (Phase 5 reports).
//
// PROPS
//   data      [{ label: "Jan", income: 1200, cost: 800 }, ...]
//   xKey      field holding the x label (default "label")
//   series    [{ key: "income", label: "Income" }, ...]   one line each (max 5)
//   format    (n) => text for the tooltip and the y axis (default: plain number)
//   height    px (default 260)    title / summary / empty   text around the chart

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame, ChartTooltip, colorAt } from "./ChartParts.jsx";

export default function LineTrend({ data = [], xKey = "label", series, format = (v) => v, height = 260, title, summary, empty }) {
  const has = data.some((d) => series.some((s) => Number(d[s.key]) > 0));
  return (
    <ChartFrame title={title} summary={summary} empty={empty} hasData={has} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fill: "var(--chart-axis)", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--chart-grid)" }} />
          <YAxis tick={{ fill: "var(--chart-axis)", fontSize: 12 }} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : v)} />
          <Tooltip content={<ChartTooltip format={format} />} />
          {series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s, i) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={colorAt(i)} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
