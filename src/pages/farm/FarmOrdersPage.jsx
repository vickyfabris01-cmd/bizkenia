// src/pages/farm/FarmOrdersPage.jsx — NEW FILE
//
// AIM
// /app/:slug/orders — online orders for the farm's produce, paid by M-Pesa and collected by the
// buyer (farms have no delivery). This is the shop's Orders screen: start processing, mark ready for
// pickup, mark collected, or cancel (the stock goes back). A paid order is added to the farm's
// income by itself.

import OrdersPage from "../shop/OrdersPage.jsx";

export default function FarmOrdersPage() {
  return <OrdersPage />;
}
