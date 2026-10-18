// src/components/data/MonthGrid.jsx — NEW FILE
//
// AIM
// A small month calendar that colours days by a mark ("present", "absent", "half_day", "leave"). Used for a worker's
// attendance; reusable for any day-by-day status.
//
// PROPS  marks { "YYYY-MM-DD": status }    month (Date, default today)

const HEAD = ["M", "T", "W", "T", "F", "S", "S"];
const LABEL = { present: "present", absent: "absent", half_day: "half day", leave: "on leave" };

export default function MonthGrid({ marks = {}, month = new Date() }) {
  const y = month.getFullYear(); const m = month.getMonth();
  const first = new Date(y, m, 1);
  const lead = (first.getDay() + 6) % 7;
  const n = new Date(y, m + 1, 0).getDate();
  const pad = (v) => String(v).padStart(2, "0");
  const cells = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => i + 1)];
  return (
    <div>
      <p className="rent-strong" style={{ margin: "0 0 8px" }}>{first.toLocaleDateString("en-KE", { month: "long", year: "numeric" })}</p>
      <div className="rent-month" role="grid" aria-label="Attendance calendar">
        {HEAD.map((h, i) => <span key={i} className="rent-month__h" aria-hidden="true">{h}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={`b${i}`} className="rent-month__d blank" />;
          const s = marks[`${y}-${pad(m + 1)}-${pad(d)}`];
          return <span key={d} className={`rent-month__d ${s || ""}`} role="gridcell" aria-label={`${d}${s ? `, ${LABEL[s]}` : ""}`}>{d}</span>;
        })}
      </div>
    </div>
  );
}
