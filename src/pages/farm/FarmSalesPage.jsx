// src/pages/farm/FarmSalesPage.jsx — NEW FILE
//
// AIM
// /app/:slug/sales — sales the farm makes outside the system (cash, M-Pesa to the farmer's phone, a
// walk-in who asks for something that was never listed). This is the shared Sales screen in farm
// mode: a sale can come from a listing or straight from the store, a crop in the field or a
// livestock group, and the stock, the listings and the income update by themselves.

import SalesPage from "../shop/SalesPage.jsx";

export default function FarmSalesPage() {
  return <SalesPage farm />;
}
