// src/components/charts/ChartParts.jsx — NEW FILE
//
// AIM
// Pieces shared by LineTrend, BarCompare and DonutBreakdown: the series colours (from the chart
// tokens in styles/tokens.css, so light and dark both work), a tooltip, and the frame that
// gives a chart a text summary for screen readers and an empty message when there is no data.

import "./Charts.css";

export const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
export const colorAt = (i) => SERIES_COLORS[i % SERIES_COLORS.length];

export function ChartTooltip({ active, payload, label, format = (v) => v }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      {label != null && <p className="chart-tip__label">{label}</p>}
      {payload.map((p) => (
        <p key={p.dataKey || p.name} className="chart-tip__row">
          <i style={{ background: p.color || p.payload?.fill }} />
          <span>{p.name}</span>
          <b>{format(p.value)}</b>
        </p>
      ))}
    </div>
  );
}

export function ChartFrame({ title, summary, empty, hasData, height, children }) {
  return (
    <figure className="chart" style={{ margin: 0 }}>
      {title && <figcaption className="chart__title">{title}</figcaption>}
      {hasData ? (
        <div className="chart__box" style={{ height }} role="img" aria-label={summary || title || "Chart"}>{children}</div>
      ) : (
        <div className="chart__empty" style={{ minHeight: height }}>{empty || "No data to show yet."}</div>
      )}
    </figure>
  );
}
