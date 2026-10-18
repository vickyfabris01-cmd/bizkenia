// src/components/data/SimpleTable.jsx — NEW FILE
//
// AIM
// A small, token-styled table used by the Phase 1 admin screens. On phones every row becomes a
// stacked card (each cell shows its column label), so nothing needs sideways scrolling.
// (Phase 2 adds the full data table with sorting and filters to components/ui.)
//
// PROPS
//   columns   [{ key, label, render?(row), align? }]
//   rows      array of objects          rowKey   field used as the React key (default "id")
//   onRowClick(row)                      makes rows clickable (and keyboard friendly)
//   loading   shows skeleton rows        empty    node shown when there are no rows

import "./SimpleTable.css";
import { Skeleton } from "../ui";

export default function SimpleTable({ columns, rows = [], rowKey = "id", onRowClick, loading = false, empty = null }) {
  if (loading) {
    return (
      <div className="stable-skel" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={44} />)}
      </div>
    );
  }
  if (!rows.length) return empty;
  return (
    <div className="stable-wrap">
      <table className="stable">
        <thead>
          <tr>{columns.map((c) => <th key={c.key} scope="col" style={{ textAlign: c.align }}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[rowKey]} className={onRowClick ? "is-clickable" : ""}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (e) => { if (e.key === "Enter") onRowClick(row); } : undefined}
              tabIndex={onRowClick ? 0 : undefined}>
              {columns.map((c) => (
                <td key={c.key} data-label={c.label} style={{ textAlign: c.align }}>{c.render ? c.render(row) : row[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
