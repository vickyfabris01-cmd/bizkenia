// src/pages/farm/ProducePage.jsx — MODIFIED (every listing comes from the store, the field or livestock)
//
// AIM
// /app/:slug/produce — what the farm has for sale. This is the shop's product screen with farm
// wording: add produce with photos, a price and a unit (kg, crate, litre...), set it to On sale
// to show it on the farm's public page and on the home page. What is listed must come from
// something the farm holds (store, field crop or livestock), so a farm cannot list what it does not
// have. Buyers can pay by M-Pesa and collect, or contact the farm directly.

import ProductsPage from "../shop/ProductsPage.jsx";

export default function ProducePage() {
  return (
    <ProductsPage
      title="Produce for sale"
      lead="What your farm sells. Everything listed comes from your store, a crop in the field or your livestock. Only items that are On sale show on your public page and the home page."
      noun="produce item" plural="produce items" addLabel="Add produce"
      farm
      defaultUnit="kg" namePlaceholder="Tomatoes, eggs, fresh milk" unitPlaceholder="kg, crate, litre, tray"
      emptyHelp="Add what you have for sale with a photo and a price. Set it to On sale when it is ready."
      deleteMessage="Consider archiving instead to hide it. This cannot be undone."
    />
  );
}