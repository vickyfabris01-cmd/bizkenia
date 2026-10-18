// src/components/charts/BarCompare.jsx — NEW FILE
//
// AIM
// A bar chart for comparing amounts side by side (billed and collected per month, cost by
// category, yield per crop). Set `layout="horizontal"` for long labels on a phone.
//
// PROPS
//   data      [{ label: "Maize", harvested: 4200 }, ...]
//   xKey      field holding the label (default "label")
//   series    [{ key: "harvested", label: "Harvested (kg)" }]    one bar each (max 5)
//   layout    "vertical" (default, bars go up) or "horizontal" (bars go across)
//   stacked   true to stack the series
//   format    (n) => text for the tooltip     height   px (default 260)
//   title / summary / empty   text around the chart

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame, ChartTooltip, colorAt } from "./ChartParts.jsx";

export default function BarCompare({ data = [], xKey = "label", series, layout = "vertical", stacked = false, format = (v) => v, height = 260, title, summary, empty }) {
  const has = data.some((d) => series.some((s) => Number(d[s.key]) > 0));
  const across = layout === "horizontal";
  const tick = { fill: "var(--chart-axis)", fontSize: 12 };
  return (
    <ChartFrame title={title} summary={summary} empty={empty} hasData={has} height={across ? Math.max(height, data.length * 40 + 40) : height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={across ? "vertical" : "horizontal"} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={across} horizontal={!across} />
          {across ? (
            <>
              <XAxis type="number" tick={tick} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey={xKey} tick={tick} tickLine={false} axisLine={false} width={96} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} tick={tick} tickLine={false} axisLine={{ stroke: "var(--chart-grid)" }} />
              <YAxis tick={tick} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : v)} />
            </>
          )}
          <Tooltip content={<ChartTooltip format={format} />} cursor={{ fill: "var(--chart-grid)", opacity: 0.4 }} />
          {series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={colorAt(i)} stackId={stacked ? "a" : undefined} radius={stacked ? 0 : [4, 4, 0, 0]} maxBarSize={36} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
