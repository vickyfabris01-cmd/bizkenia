// src/modules/shop/index.js — MODIFIED (Phase 5 step 3 Reports; Sales screen added)
//
// AIM
// The shop module's navigation. A shop business shows this menu to its owner and managers:
// dashboard, products, orders, inventory, customers, reports and settings (owner only). Screens live in src/pages/shop/.

import { lazy } from "react";
import { registerModule } from "../registry.js";

const BOTH = ["owner", "manager"];
const OWNER = ["owner"];

registerModule({
  type: "shop",
  label: "Shop",
  nav: [
    { id: "dashboard", label: "Dashboard", icon: "dashboard", path: "", end: true, phase: 5, roles: BOTH, element: lazy(() => import("../../pages/shop/ShopDashboard.jsx")) },
    { id: "products", label: "Products", icon: "home", path: "products", phase: 5, roles: BOTH, element: lazy(() => import("../../pages/shop/ProductsPage.jsx")) },
    { id: "orders", label: "Orders", icon: "file", path: "orders", phase: 5, roles: BOTH, element: lazy(() => import("../../pages/shop/OrdersPage.jsx")) },
    { id: "sales", label: "Sales", icon: "card", path: "sales", phase: 5, roles: BOTH, element: lazy(() => import("../../pages/shop/SalesPage.jsx")) },
    { id: "inventory", label: "Inventory", icon: "building", path: "inventory", phase: 5, roles: BOTH, element: lazy(() => import("../../pages/shop/InventoryPage.jsx")) },
    { id: "customers", label: "Customers", icon: "users", path: "customers", phase: 5, roles: BOTH, element: lazy(() => import("../../pages/shop/CustomersPage.jsx")) },
    { id: "share", label: "Share and promote", icon: "megaphone", path: "share", phase: 6, roles: BOTH, element: lazy(() => import("../../pages/shared/MarketingPage.jsx")) },
    { id: "reports", label: "Reports", icon: "chart", path: "reports", phase: 5, roles: OWNER, element: lazy(() => import("../../pages/shop/ShopReportsPage.jsx")) },
    { id: "settings", label: "Settings", icon: "settings", path: "settings", phase: 5, roles: OWNER, element: lazy(() => import("../../pages/shop/ShopSettingsPage.jsx")) },
  ],
});
