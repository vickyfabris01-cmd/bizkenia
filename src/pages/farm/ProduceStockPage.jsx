// src/pages/farm/ProduceStockPage.jsx — NEW FILE
//
// AIM
// /app/:slug/produce-stock — how much of each produce item you have to sell. The shop's stock
// screen with farm wording: stock in, stock out and recounts, with a history for each item.
// (The farm's own Inventory screen is for seed, feed, fertiliser and tools, not produce.)

import InventoryPage from "../shop/InventoryPage.jsx";

export default function ProduceStockPage() {
  return <InventoryPage title="Produce stock" noun="produce item" plural="produce items" />;
}