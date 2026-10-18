// src/pages/farm/shared.jsx — NEW FILE
//
// AIM
// Small pieces every farm screen uses: the page heading, tabs, stat tiles, status badges with
// plain-English labels, a loading skeleton, an error box with a retry button, and FormModal, a
// form-in-a-dialog driven by a short list of fields so no screen repeats the same modal code.
// (The farm module never imports from the rental module, so the shared pieces live here.)
//
// FormModal PROPS
//   open, onClose, title, submitLabel
//   fields    [{ key, label, type: "text"|"number"|"date"|"select"|"textarea", required, options, placeholder, helper,
//                min, step, show?(values) }]
//   initial   starting values          onSubmit(values) -> Promise<{ error }>  (error text is shown in the dialog)
//   danger    optional { label, onClick } shown as a red button on the left (e.g. Delete)

import "./Farm.css";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Badge, Button, Input, SelectInput, Skeleton, TextArea } from "../../components/ui";
import { Modal } from "../../components/modals/Modal.jsx";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { formatKsh } from "../../lib/format.js";

export const money = formatKsh;
export const today = () => new Date().toISOString().slice(0, 10);
export const kg = (n) => `${Number(n || 0).toLocaleString("en-KE", { maximumFractionDigits: 1 })} kg`;
export const qty = (n) => Number(n || 0).toLocaleString("en-KE", { maximumFractionDigits: 2 });
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "");
export const opts = (list) => list.map((v) => ({ value: v, label: cap(v) }));

export const CROP_STATUS = { planned: ["neutral", "Planned"], planted: ["info", "Planted"], growing: ["success", "Growing"], harvested: ["brand", "Harvested"] };
export const ACTIVITY_KINDS = ["planting", "fertilising", "spraying", "watering", "weeding", "other"];
export const ITEM_CATEGORIES = ["seed", "fertiliser", "chemical", "feed", "tool", "fuel", "other"];
export const SPECIES = ["cattle", "goats", "sheep", "pigs", "poultry", "rabbits", "bees", "fish", "other"];
export const EVENT_KINDS = ["vaccination", "feeding", "treatment", "birth", "sale", "loss", "other"];
export const EXPENSE_CATEGORIES = ["seeds", "fertiliser", "chemicals", "labour", "feed", "equipment", "fuel", "transport", "other"];
export const INCOME_SOURCES = [{ value: "crop_sale", label: "Crop sale" }, { value: "livestock_sale", label: "Livestock sale" }, { value: "other", label: "Other income" }];

export function StatusBadge({ status }) {
  const [variant, text] = CROP_STATUS[status] || ["neutral", cap(status)];
  return <Badge variant={variant}>{text}</Badge>;
}

export function useFarm() {
  const { business, role } = useBusinessContext();
  return { business, bid: business.id, base: `/app/${business.slug}`, role };
}

export function PageHead({ title, lead, children }) {
  return (
    <div className="farm-head">
      <div>
        <h2 className="farm-head__title">{title}</h2>
        {lead && <p className="farm-head__lead">{lead}</p>}
      </div>
      {children && <div className="farm-actions">{children}</div>}
    </div>
  );
}

export function Tabs({ value, onChange, tabs, label }) {
  return (
    <div className="farm-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" className="farm-tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}>
          {t.label}{t.count != null && <span className="farm-tab__n">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, note, to, tone }) {
  const body = (<><span className="farm-stat__label">{label}</span><span className="farm-stat__value">{value}</span>{note && <span className="farm-stat__note">{note}</span>}</>);
  const cls = `farm-stat${tone ? ` farm-stat--${tone}` : ""}`;
  return to ? <Link to={to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function Loading({ rows = 4 }) {
  return <div className="farm" aria-busy="true" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} height={i === 0 ? 40 : 72} />)}</div>;
}

export function LoadError({ error, onRetry }) {
  return (
    <div className="farm">
      <Alert type="error" title="Could not load this page" message={error} />
      {onRetry && <div><Button variant="outline" onClick={onRetry}>Try again</Button></div>}
    </div>
  );
}

export function FormModal({ open, onClose, title, submitLabel = "Save", fields, initial = {}, onSubmit, danger }) {
  const [vals, setVals] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const form = vals ?? initial;
  const set = (k, v) => setVals({ ...form, [k]: v });

  async function submit(e) {
    e.preventDefault();
    for (const f of fields) {
      if (f.show && !f.show(form)) continue;
      const v = form[f.key];
      if (f.required && (v == null || String(v).trim() === "")) { setError(`${f.label} is required.`); return; }
      if (f.type === "number" && v !== "" && v != null && Number.isNaN(Number(v))) { setError(`${f.label} must be a number.`); return; }
    }
    setBusy(true); setError("");
    const res = await onSubmit(form);
    setBusy(false);
    if (res?.error) { setError(res.error); return; }
    setVals(null);
    onClose();
  }
  function close() { setVals(null); setError(""); onClose(); }

  return (
    <Modal isOpen={open} onClose={close} title={title} size="md"
      footer={<>
        {danger && <Button variant="danger" onClick={danger.onClick} style={{ marginRight: "auto" }}>{danger.label}</Button>}
        <Button variant="secondary" onClick={close}>Cancel</Button>
        <Button type="submit" form="farm-form" loading={busy}>{submitLabel}</Button>
      </>}>
      <form id="farm-form" className="farm-form" onSubmit={submit} noValidate>
        {error && <Alert type="error" message={error} />}
        {fields.filter((f) => !f.show || f.show(form)).map((f) => {
          const common = { label: f.label, required: f.required, helper: f.helper, value: form[f.key] ?? "" };
          if (f.type === "select") return <SelectInput key={f.key} {...common} options={f.options} placeholder={f.placeholder} onChange={(v) => set(f.key, v)} />;
          if (f.type === "textarea") return <TextArea key={f.key} {...common} rows={3} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />;
          return <Input key={f.key} {...common} type={f.type || "text"} min={f.min} step={f.step} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />;
        })}
      </form>
    </Modal>
  );
}
