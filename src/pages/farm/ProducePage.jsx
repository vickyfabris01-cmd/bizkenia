// src/pages/farm/ProducePage.jsx — NEW FILE
//
// AIM
// /app/:slug/produce — what the farm has for sale. This is the shop's product screen with farm
// wording: add produce with photos, a price and a unit (kg, crate, litre...), set it to On sale
// to show it on the farm's public page and on the home page. Buyers contact the farm directly.

import ProductsPage from "../shop/ProductsPage.jsx";

export default function ProducePage() {
  return (
    <ProductsPage
      title="Produce for sale"
      lead="What your farm sells. Only items that are On sale show on your public page and the home page. Buyers call or message you."
      noun="produce item" plural="produce items" addLabel="Add produce"
      defaultUnit="kg" namePlaceholder="Tomatoes, eggs, fresh milk" unitPlaceholder="kg, crate, litre, tray"
      emptyHelp="Add what you have for sale with a photo and a price. Set it to On sale when it is ready."
      deleteMessage="Consider archiving instead to hide it. This cannot be undone."
    />
  );
}