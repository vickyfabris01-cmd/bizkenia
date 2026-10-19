// src/pages/shop/ProductsPage.jsx — MODIFIED (optional wording props so farms can reuse it for produce)
//
// AIM
// /app/:slug/products — the shop's catalogue. Search, filter by status and category, add a
// product with up to five photos, edit it, put it on sale or archive it, and manage categories.
// A product is only visible to shoppers when it is "On sale". Opening stock is set when the
// product is created; after that stock changes on the Inventory screen. A photo that is replaced
// or removed, or uploaded and then abandoned, is deleted from storage.
//
// Props are all optional and default to the shop's wording. The farm's Produce screen passes its
// own title, nouns and default unit (see pages/farm/ProducePage.jsx).

import "./Shop.css";
import { useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, CardBody, EmptyState, Input, SelectInput } from "../../components/ui";
import { ConfirmDialog, Modal } from "../../components/modals/Modal.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import {
  MAX_PHOTOS, PHOTO_MAX_MB, deleteCategory, deleteProduct, listCategories, listProducts, removeProductPhoto,
  saveCategory, saveProduct, uploadProductPhoto,
} from "../../lib/api/shop.js";
import { FormModal, Loading, LoadError, PageHead, ProductBadge, money, useShop } from "./shared.jsx";

const STATUS_OPTIONS = [{ value: "draft", label: "Draft (hidden)" }, { value: "active", label: "On sale" }, { value: "archived", label: "Archived (hidden)" }];

function stockBadge(p) {
  if (p.stock <= 0) return <Badge variant="error">Out of stock</Badge>;
  if (Number(p.low_stock_level) > 0 && p.stock <= p.low_stock_level) return <Badge variant="warning">Low stock: {p.stock}</Badge>;
  return <Badge variant="neutral">{p.stock} in stock</Badge>;
}

function Thumb({ p }) {
  const img = p.images?.[0];
  return <span className="shop-thumb" style={img ? { backgroundImage: `url("${img}")` } : undefined} aria-hidden="true">{!img && (p.name || "?").charAt(0).toUpperCase()}</span>;
}

function Categories({ bid, onClose, onChanged }) {
  const toast = useToast();
  const { data: cats, error, reload } = useAsync(() => listCategories(bid), [bid]);
  const [name, setName] = useState("");
  const [edit, setEdit] = useState(null); // { id, name }
  const [confirm, setConfirm] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) { setErr("Enter a category name."); return; }
    setBusy(true); setErr("");
    const r = await saveCategory(bid, { name });
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setName(""); reload(); onChanged();
  }
  async function rename() {
    if (!edit.name.trim()) { setErr("Enter a category name."); return; }
    setBusy(true); setErr("");
    const r = await saveCategory(bid, edit);
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setEdit(null); reload(); onChanged();
  }
  async function remove() {
    setBusy(true);
    const r = await deleteCategory(confirm.id);
    setBusy(false); setConfirm(null);
    if (r.error) { setErr(r.error); return; }
    toast.success("Category removed"); reload(); onChanged();
  }

  return (
    <Modal isOpen onClose={onClose} title="Categories" size="md" footer={<Button variant="secondary" onClick={onClose}>Done</Button>}>
      {(error || err) && <Alert type="error" message={error || err} />}
      <form className="shop-bar" onSubmit={add} noValidate>
        <Input label="New category" value={name} onChange={(e) => setName(e.target.value)} placeholder="Drinks, Clothes, Electronics" />
        <div className="shop-bar__fit"><Button type="submit" loading={busy}>Add</Button></div>
      </form>
      {!cats?.length ? <p className="shop-hint" style={{ marginTop: "var(--space-3)" }}>No categories yet. Categories help shoppers find products.</p> : (
        <ul className="shop-list">
          {cats.map((c) => (
            <li key={c.id}>
              {edit?.id === c.id ? (
                <>
                  <div className="shop-list__main"><Input label="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
                  <div className="shop-list__end"><Button size="sm" loading={busy} onClick={rename}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button></div>
                </>
              ) : (
                <>
                  <div className="shop-list__main"><span className="shop-list__title">{c.name}</span></div>
                  <div className="shop-list__end"><Button size="sm" variant="outline" onClick={() => setEdit({ id: c.id, name: c.name })}>Rename</Button><Button size="sm" variant="ghost" onClick={() => setConfirm(c)}>Delete</Button></div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog isOpen={Boolean(confirm)} title="Delete this category?" message="Its products are kept and become uncategorised." confirmLabel="Delete category" loading={busy} onConfirm={remove} onCancel={() => setConfirm(null)} />
    </Modal>
  );
}

function PhotoManager({ bid, images, set, onUploaded }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const list = images || [];

  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (list.length >= MAX_PHOTOS) { toast.info(`A product can have up to ${MAX_PHOTOS} photos.`); return; }
    setBusy(true);
    const { data, error } = await uploadProductPhoto(bid, file);
    setBusy(false);
    if (error) { toast.error(error); return; }
    onUploaded(data.url);
    set("images", [...list, data.url]);
  }
  const makeMain = (i) => set("images", [list[i], ...list.filter((_, k) => k !== i)]);
  const remove = (i) => set("images", list.filter((_, k) => k !== i));

  return (
    <div className="shop-form">
      <span className="shop-list__title">Photos</span>
      {list.length > 0 && (
        <div className="shop-photos">
          {list.map((u, i) => (
            <div className="shop-photo" key={u}>
              <img className="shop-photo__img" src={u} alt="" loading="lazy" />
              <div className="shop-photo__bar">
                {i === 0 ? <Badge variant="brand">Main</Badge> : <Button size="sm" variant="outline" type="button" onClick={() => makeMain(i)}>Make main</Button>}
                <Button size="sm" variant="ghost" type="button" onClick={() => remove(i)}>Remove</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <label className="shop-file"><span>{busy ? "Uploading..." : "Add a photo"}</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={onPick} aria-label="Add a product photo" /></label>
      <p className="shop-hint">JPG, PNG or WebP, up to {PHOTO_MAX_MB} MB each, up to {MAX_PHOTOS} photos. The first one is the main photo.</p>
    </div>
  );
}

export default function ProductsPage({
  title = "Products",
  lead = "What you sell. Only products that are On sale are shown to shoppers.",
  noun = "product",
  plural = "products",
  addLabel = "Add a product",
  defaultUnit = "item",
  namePlaceholder = "Fresh orange juice 1 L",
  unitPlaceholder = "item, kg, litre, pack",
  emptyHelp = "Add your first product with a photo and a price. Set it to On sale when it is ready.",
  deleteMessage = "Past orders keep its name and price. Consider archiving instead to hide it. This cannot be undone.",
}) {
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);
  const { bid } = useShop();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("");
  const [cat, setCat] = useState("");
  const [limit, setLimit] = useState(24);
  const [form, setForm] = useState(null);     // { product? }
  const [cats, setCats] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const uploaded = useRef([]);
  const saved = useRef(false);

  useEffect(() => { const t = setTimeout(() => { setTerm(search); setLimit(24); }, 300); return () => clearTimeout(t); }, [search]);

  const { data: categories, reload: reloadCats } = useAsync(() => listCategories(bid), [bid]);
  const { data: rows, error, loading, reload } = useAsync(() => listProducts(bid, { search: term, status, categoryId: cat, limit: limit + 1 }), [bid, term, status, cat, limit]);

  const catOptions = [{ value: "", label: "No category" }, ...(categories || []).map((c) => ({ value: c.id, label: c.name }))];
  const fields = (isNew) => [
    { key: "name", label: `${Noun} name`, required: true, placeholder: namePlaceholder },
    { key: "category_id", label: "Category", type: "select", options: catOptions },
    { key: "price", label: "Price (KSh)", type: "number", min: "0", step: "any", required: true },
    { key: "compare_at_price", label: "Old price (KSh, optional)", type: "number", min: "0", step: "any", helper: "Shown crossed out beside the price when higher" },
    { key: "unit", label: "Sold by", placeholder: unitPlaceholder },
    { key: "sku", label: "SKU or code (optional)" },
    ...(isNew ? [{ key: "stock", label: "Stock you have now", type: "number", min: "0", step: "1" }] : []),
    { key: "low_stock_level", label: "Warn me when stock is at or below", type: "number", min: "0", step: "1" },
    { key: "status", label: "Visibility", type: "select", options: STATUS_OPTIONS },
    { key: "description", label: "Description", type: "textarea" },
  ];

  function openForm(f) { uploaded.current = []; saved.current = false; setForm(f); }
  function closeForm() {
    if (!saved.current) uploaded.current.forEach((u) => removeProductPhoto(bid, u)); // abandoned uploads
    uploaded.current = [];
    setForm(null);
  }

  async function submit(v) {
    const r = await saveProduct(bid, v);
    if (r.error) return r;
    saved.current = true;
    const before = form?.product?.images || [];
    const after = v.images || [];
    [...before.filter((u) => !after.includes(u)), ...uploaded.current.filter((u) => !after.includes(u))].forEach((u) => removeProductPhoto(bid, u));
    toast.success(form?.product ? `${Noun} updated` : `${Noun} added`);
    reload();
    return r;
  }

  async function remove() {
    setBusy(true);
    const r = await deleteProduct(confirm.id);
    setBusy(false);
    if (r.error) { setErr(r.error); setConfirm(null); return; }
    (confirm.images || []).forEach((u) => removeProductPhoto(bid, u));
    setConfirm(null); toast.success(`${Noun} removed`); reload();
  }

  if (loading && !rows) return <Loading />;
  if (error) return <LoadError error={error} onRetry={reload} />;
  const items = (rows || []).slice(0, limit);
  const more = (rows || []).length > limit;
  const filtered = Boolean(term || status || cat);
  const p = form?.product;

  return (
    <div className="shop">
      <PageHead title={title} lead={lead}>
        <Button variant="outline" onClick={() => setCats(true)}>Categories</Button>
        <Button onClick={() => openForm({})}>{addLabel}</Button>
      </PageHead>
      {err && <Alert type="error" message={err} />}

      <div className="shop-bar">
        <Input label="Search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`${Noun} name`} />
        <SelectInput label="Visibility" value={status} onChange={(v) => { setStatus(v); setLimit(24); }} options={[{ value: "", label: "All" }, ...STATUS_OPTIONS]} />
        <SelectInput label="Category" value={cat} onChange={(v) => { setCat(v); setLimit(24); }} options={[{ value: "", label: "All categories" }, ...(categories || []).map((c) => ({ value: c.id, label: c.name }))]} />
      </div>

      {items.length === 0 ? (
        <Card><EmptyState icon="file" title={filtered ? `No ${plural} match` : `No ${plural} yet`}
          description={filtered ? "Try a different search or clear the filters." : emptyHelp}
          action={filtered ? <Button variant="outline" onClick={() => { setSearch(""); setStatus(""); setCat(""); }}>Clear filters</Button> : <Button onClick={() => openForm({})}>{addLabel}</Button>} /></Card>
      ) : (
        <>
          <div className="shop-cards">
            {items.map((x) => (
              <button type="button" key={x.id} className="shop-card" onClick={() => openForm({ product: x })} aria-label={`Edit ${x.name}`}>
                <span className="shop-prod">
                  <Thumb p={x} />
                  <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
                    <span className="shop-card__title">{x.name}</span>
                    <span className="shop-card__meta">{x.category?.name || "No category"}</span>
                    <span className="shop-price">{money(x.price)}{x.compare_at_price ? <s>{money(x.compare_at_price)}</s> : null}</span>
                  </span>
                </span>
                <span className="shop-badges">{stockBadge(x)}<ProductBadge status={x.status} /></span>
              </button>
            ))}
          </div>
          {more && <div className="shop-more"><Button variant="outline" onClick={() => setLimit(limit + 24)}>Show more</Button></div>}
        </>
      )}

      <FormModal open={Boolean(form)} title={p ? `Edit ${noun}` : addLabel} fields={fields(!p)} onClose={closeForm} onSubmit={submit}
        initial={p ? { ...p, compare_at_price: p.compare_at_price ?? "", sku: p.sku || "", description: p.description || "", category_id: p.category_id || "", images: p.images || [] }
          : { name: "", category_id: "", price: "", compare_at_price: "", unit: defaultUnit, sku: "", stock: "", low_stock_level: 5, status: "draft", description: "", images: [] }}
        danger={p ? { label: "Delete", onClick: () => { setConfirm(p); closeForm(); } } : undefined}
        extra={(vals, set) => <PhotoManager bid={bid} images={vals.images} set={set} onUploaded={(u) => uploaded.current.push(u)} />} />

      {cats && <Categories bid={bid} onClose={() => setCats(false)} onChanged={reloadCats} />}
      <ConfirmDialog isOpen={Boolean(confirm)} title={`Delete this ${noun}?`} message={deleteMessage} confirmLabel={`Delete ${noun}`} loading={busy} onConfirm={remove} onCancel={() => setConfirm(null)} />
    </div>
  );
}