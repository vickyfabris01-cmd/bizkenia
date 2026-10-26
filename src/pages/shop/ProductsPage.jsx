// src/pages/shop/ProductsPage.jsx — MODIFIED (after an item is put on sale it offers to share it; editing an item on sale has a Share button. Both lead to the Share page)
//
// AIM
// /app/:slug/products — the shop's catalogue. Search, filter by status and category, add a
// product with up to five photos, edit it, put it on sale or archive it, and manage categories.
// A product is only visible to shoppers when it is "On sale". A photo that is replaced or removed,
// or uploaded and then abandoned, is deleted from storage.
//
// STOCK
//   Shop   a product is its own store: "In my store" is what the shop has and "Quantity to list" is
//          what is on sale (or "list everything"). Store stock changes on the Inventory screen.
//   Farm   (farm prop) every listing must come from something the farm holds: an item in the store
//          (produce, tools, machinery, inputs), a crop in the field, or a livestock group. The
//          database refuses to list more than is on hand. A listing may use a different unit and
//          ratio, for example maize fodder in bundles of 5 kg from the maize crop. "Available until"
//          hides greens and vegetables after a date. ?source=item:ID (or crop:/livestock:) opens the
//          form for that holding.
//
// Props are all optional and default to the shop's wording. The farm's Produce screen passes its
// own title, nouns, default unit and farm (see pages/farm/ProducePage.jsx).

import "./Shop.css";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Badge, Button, Card, CardBody, EmptyState, Input, SelectInput } from "../../components/ui";
import { ConfirmDialog, Modal } from "../../components/modals/Modal.jsx";
import ImageUploadButton from "../../components/ui/ImageUploadButton.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import {
  MAX_PHOTOS, PHOTO_MAX_MB, deleteCategory, deleteProduct, listCategories, listProducts, removeProductPhoto,
  listSources, saveCategory, saveProduct, uploadProductPhoto,
} from "../../lib/api/shop.js";
import { FormModal, Loading, LoadError, PageHead, ProductBadge, money, useShop } from "./shared.jsx";

const STATUS_OPTIONS = [{ value: "draft", label: "Draft (hidden)" }, { value: "active", label: "On sale" }, { value: "archived", label: "Archived (hidden)" }];

const KIND_LABEL = { item: "Store", crop: "Field", livestock: "Livestock" };

function stockBadge(p) {
  if (p.source_kind) return p.stock <= 0 ? <Badge variant="warning">Nothing listed</Badge> : <Badge variant="neutral">{p.stock} {p.unit} listed</Badge>;
  if (p.store_quantity <= 0) return <Badge variant="error">Out of stock</Badge>;
  if (p.stock <= 0) return <Badge variant="warning">Not listed · {p.store_quantity} in store</Badge>;
  if (Number(p.low_stock_level) > 0 && p.stock <= p.low_stock_level) return <Badge variant="warning">Low: {p.stock} listed</Badge>;
  return <Badge variant="neutral">{p.stock} listed{p.store_quantity > p.stock ? ` · ${p.store_quantity - p.stock} in store` : ""}</Badge>;
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

  async function onFiles(files) {
    const file = files[0];
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
      <ImageUploadButton className="shop-file" preset="product" disabled={busy || list.length >= MAX_PHOTOS} onFiles={onFiles} ariaLabel="Add a product photo">
        <span>{busy ? "Uploading..." : "Add a photo"}</span>
      </ImageUploadButton>
      <p className="shop-hint">Any photo works: you frame it as a square (drag and pinch) and choose JPEG, PNG or WebP. Up to {MAX_PHOTOS} photos, {PHOTO_MAX_MB} MB each. The first one is the main photo.</p>
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
  farm = false,
}) {
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);
  const { bid, base } = useShop();
  const navigate = useNavigate();
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
  const [shareItem, setShareItem] = useState(null); // an item just put on sale: asks "Share it now?"
  const uploaded = useRef([]);
  const saved = useRef(false);
  const [params, setParams] = useSearchParams();

  useEffect(() => { const t = setTimeout(() => { setTerm(search); setLimit(24); }, 300); return () => clearTimeout(t); }, [search]);

  const { data: categories, reload: reloadCats } = useAsync(() => listCategories(bid), [bid]);
  const { data: rows, error, loading, reload } = useAsync(() => listProducts(bid, { search: term, status, categoryId: cat, limit: limit + 1 }), [bid, term, status, cat, limit]);

  const { data: sources, reload: reloadSources } = useAsync(() => (farm ? listSources(bid) : Promise.resolve({ data: null, error: null })), [bid, farm]);
  const srcList = sources?.all || [];
  const findSrc = (key) => srcList.find((s) => s.key === key);
  const srcOptions = [{ value: "", label: "Choose where it comes from" }, ...srcList.map((s) => ({
    value: s.key, label: `${KIND_LABEL[s.kind]}: ${s.name} (${s.onhand} ${s.unit}${s.listed ? `, ${s.free} not yet offered` : ""})`,
  }))];

  // "Put on sale" buttons elsewhere open this form for one holding: ?source=item:ID
  useEffect(() => {
    const key = params.get("source");
    if (!farm || !key || !sources) return;
    const src = srcList.find((s) => s.key === key);
    setParams({}, { replace: true });
    if (src) openForm({ prefill: src });
  }, [params, sources]); // eslint-disable-line react-hooks/exhaustive-deps

  const catOptions = [{ value: "", label: "No category" }, ...(categories || []).map((c) => ({ value: c.id, label: c.name }))];
  const fields = (isNew) => {
    const cur = form?.product;
    const common = [
      { key: "name", label: `${Noun} name`, required: true, placeholder: namePlaceholder },
    ];
    const pricing = [
      { key: "price", label: "Price (KSh)", type: "number", min: "0", step: "any", required: true },
      { key: "compare_at_price", label: "Old price (KSh, optional)", type: "number", min: "0", step: "any", helper: "Shown crossed out beside the price when higher" },
      { key: "unit", label: "Sold by", placeholder: unitPlaceholder },
    ];
    const tail = [
      { key: "status", label: "Visibility", type: "select", options: STATUS_OPTIONS },
      { key: "description", label: "Description", type: "textarea" },
    ];
    if (farm) {
      return [
        ...common,
        ...(!isNew && cur && !cur.source_kind ? [{ key: "legacy", type: "note", text: "This item is not linked to your store, field or livestock yet, so its quantity is not tracked. Choose where it comes from to link it." }] : []),
        { key: "source", label: "Where does it come from?", type: "select", options: srcOptions, required: isNew,
          helper: srcList.length ? "Store items, crops in the field and livestock you have recorded." : "Nothing recorded yet. Add items to your Store, crops or livestock first." },
        { key: "per_unit", label: "How much of it each unit sold uses", type: "number", min: "0", step: "any", show: (v) => Boolean(v.source),
          helper: (v) => { const sel = findSrc(v.source); return sel ? `Counted in ${sel.unit}. Example: a crate of 20 kg uses 20; selling it as a bundle of 5 kg uses 5.` : ""; } },
        { key: "stock", label: "How many to list", type: "number", min: "0", step: "1",
          helper: (v) => {
            const sel = findSrc(v.source);
            if (!sel) return "Choose where it comes from first.";
            const own = cur && v.source === `${cur.source_kind}:${cur.source_id}` ? Number(cur.stock) * Number(cur.per_unit) : 0;
            const pu = Number(v.per_unit) > 0 ? Number(v.per_unit) : 1;
            return `Up to ${Math.floor((sel.free + own) / pu)} can be listed. ${sel.name}: ${sel.onhand} ${sel.unit} on hand, ${Math.max(0, sel.listed - own)} already offered.`;
          } },
        ...pricing,
        { key: "category_id", label: "Category", type: "select", options: catOptions },
        { key: "available_until", label: "Available until (optional)", type: "date", helper: "Greens and vegetables do not keep. After this date it is hidden from buyers." },
        ...tail,
      ];
    }
    return [
      ...common,
      { key: "category_id", label: "Category", type: "select", options: catOptions },
      ...pricing,
      { key: "sku", label: "SKU or code (optional)" },
      ...(isNew ? [{ key: "store_quantity", label: "In my store now", type: "number", min: "0", step: "1" }]
        : [{ key: "store_note", type: "note", text: `In your store: ${cur?.store_quantity ?? 0}. Change the store quantity on the Inventory screen.` }]),
      { key: "list_all", label: "List everything I have for sale", type: "switch" },
      { key: "stock", label: "Quantity to list", type: "number", min: "0", step: "1", show: (v) => !v.list_all, helper: "Keep some back if you like. You can change this any time." },
      { key: "low_stock_level", label: "Warn me when stock is at or below", type: "number", min: "0", step: "1" },
      ...tail,
    ];
  };

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
    reload(); reloadSources();
    // Listed successfully and visible to buyers: offer the share card straight away (once the form has closed).
    const row = r.data;
    if (row?.status === "active" && form?.product?.status !== "active") setTimeout(() => setShareItem({ ...row, images: row.images?.length ? row.images : (v.images || []) }), 300);
    else if (!form?.product) toast.info("Set it to On sale when it is ready, then you can share it.");
    return r;
  }

  async function remove() {
    setBusy(true);
    const r = await deleteProduct(confirm.id);
    setBusy(false);
    if (r.error) { setErr(r.error); setConfirm(null); return; }
    (confirm.images || []).forEach((u) => removeProductPhoto(bid, u));
    setConfirm(null); toast.success(`${Noun} removed`); reload(); reloadSources();
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
                    <span className="shop-card__meta">{farm && x.source_kind ? `From ${KIND_LABEL[x.source_kind]}: ${findSrc(`${x.source_kind}:${x.source_id}`)?.name || "your farm"}` : x.category?.name || "No category"}</span>
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
        initial={p ? { ...p, compare_at_price: p.compare_at_price ?? "", sku: p.sku || "", description: p.description || "", category_id: p.category_id || "", images: p.images || [],
            source: p.source_kind ? `${p.source_kind}:${p.source_id}` : "", per_unit: p.per_unit ?? 1, list_all: p.list_all !== false, available_until: p.available_until || "" }
          : { name: form?.prefill?.name || "", category_id: "", price: "", compare_at_price: "", unit: form?.prefill ? (form.prefill.kind === "livestock" ? "head" : form.prefill.unit) : defaultUnit, sku: "", stock: "", store_quantity: "",
              list_all: true, source: form?.prefill?.key || "", per_unit: 1, available_until: "", low_stock_level: farm ? 0 : 5, status: "draft", description: "", images: [] }}
        danger={p ? { label: "Delete", onClick: () => { setConfirm(p); closeForm(); } } : undefined}
        extra={(vals, set) => (
          <>
            <PhotoManager bid={bid} images={vals.images} set={set} onUploaded={(u) => uploaded.current.push(u)} />
            {p && p.status === "active" && <Button type="button" variant="outline" onClick={() => { closeForm(); navigate(`${base}/share?open=${p.id}`); }}>Share this {noun}</Button>}
          </>
        )} />

      <ConfirmDialog isOpen={Boolean(shareItem)} variant="info" title={`${Noun} is on sale`} message={`${shareItem?.name || "It"} is live. Share it now as a link or a poster?`}
        confirmLabel="Share" cancelLabel="Not now" onConfirm={() => { const id = shareItem.id; setShareItem(null); navigate(`${base}/share?open=${id}`); }} onCancel={() => setShareItem(null)} />
      {cats && <Categories bid={bid} onClose={() => setCats(false)} onChanged={reloadCats} />}
      <ConfirmDialog isOpen={Boolean(confirm)} title={`Delete this ${noun}?`} message={deleteMessage} confirmLabel={`Delete ${noun}`} loading={busy} onConfirm={remove} onCancel={() => setConfirm(null)} />
    </div>
  );
}