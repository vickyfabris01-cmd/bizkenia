// src/lib/csv.js — NEW FILE
//
// AIM
// Turns rows into a CSV file in the browser and downloads it. No server involved. Opens cleanly
// in Excel and Google Sheets (UTF-8 with a byte-order mark, quotes escaped, numbers left as numbers).
//
//   downloadCsv("occupancy.csv", rows, [
//     { key: "building", label: "Building" },
//     { key: "rooms", label: "Rooms" },
//     { key: "paid", label: "Paid (KSh)", value: (r) => Math.round(r.paid) },
//   ]);
//
// toCsv(rows, columns) returns the text if you only need the string.

const cell = (v) => {
  if (v == null) return "";
  let s = typeof v === "number" ? String(v) : String(v);
  // A cell that starts with = + - @ could be run as a formula by a spreadsheet; keep text safe.
  if (typeof v === "string" && /^[=+\-@]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows, columns) {
  const head = columns.map((c) => cell(c.label)).join(",");
  const body = (rows || []).map((r) => columns.map((c) => cell(c.value ? c.value(r) : r[c.key])).join(","));
  return [head, ...body].join("\r\n");
}

export function downloadCsv(filename, rows, columns) {
  const blob = new Blob(["﻿" + toCsv(rows, columns)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
