// src/components/charts/DonutBreakdown.jsx — NEW FILE
//
// AIM
// A donut chart for "what share is each part" (cost by category, rooms by status, invoices by
// status). The legend under it lists every part with its value, so the chart never relies on
// colour alone.
//
// PROPS
//   data      [{ name: "Seeds", value: 12000 }, ...]   zero values are left out
//   format    (n) => text for the tooltip and legend (default: plain number)
//   height    px (default 220)    centreLabel   text in the hole (e.g. the total)
//   title / summary / empty   text around the chart

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartFrame, ChartTooltip, colorAt } from "./ChartParts.jsx";

export default function DonutBreakdown({ data = [], format = (v) => v, height = 220, centreLabel, title, summary, empty }) {
  const parts = data.filter((d) => Number(d.value) > 0);
  return (
    <ChartFrame title={title} summary={summary || parts.map((p) => `${p.name} ${format(p.value)}`).join(", ")} empty={empty} hasData={parts.length > 0} height={height}>
      <div style={{ position: "relative", height: "100%" }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={parts} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="88%" paddingAngle={2} stroke="var(--color-surface)" strokeWidth={2}>
              {parts.map((p, i) => <Cell key={p.name} fill={colorAt(i)} />)}
            </Pie>
            <Tooltip content={<ChartTooltip format={format} />} />
          </PieChart>
        </ResponsiveContainer>
        {centreLabel && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", fontWeight: "var(--weight-bold)", color: "var(--color-text)", fontSize: "var(--text-lg)" }}>{centreLabel}</div>}
      </div>
      <ul className="chart-legend">
        {parts.map((p, i) => <li key={p.name}><i style={{ background: colorAt(i) }} />{p.name} · {format(p.value)}</li>)}
      </ul>
    </ChartFrame>
  );
}
