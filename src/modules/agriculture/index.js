// src/modules/agriculture/index.js — MODIFIED (Store, Sales and Orders; produce stock now comes from what the farm holds)
//
// AIM
// The agriculture module's navigation. An agriculture business (a farm) shows this menu to its
// owner and managers: dashboard, crops, produce for sale, sales, orders, fields and land,
// store and tools, livestock, income and expenses, tasks, analytics, reports, and settings (owner only).
// Every screen is built, so none opens the ComingSoon page. Screens live in src/pages/farm/
// (Reports is shared with rental; Produce reuses the shop's product screens).

import { lazy } from "react";
import { registerModule } from "../registry.js";

const BOTH = ["owner", "manager"];
const OWNER = ["owner"];

registerModule({
  type: "agriculture",
  label: "Agriculture",
  nav: [
    { id: "dashboard", label: "Dashboard", icon: "dashboard", path: "", end: true, phase: 4, roles: BOTH, element: lazy(() => import("../../pages/farm/FarmDashboard.jsx")) },
    { id: "crops", label: "Crops", icon: "home", path: "crops", phase: 4, roles: BOTH, element: lazy(() => import("../../pages/farm/CropsPage.jsx")) },
    { id: "produce", label: "Produce for sale", icon: "megaphone", path: "produce", phase: 4, roles: BOTH, element: lazy(() => import("../../pages/farm/ProducePage.jsx")) },
    { id: "sales", label: "Sales", icon: "card", path: "sales", phase: 5, roles: BOTH, element: lazy(() => import("../../pages/farm/FarmSalesPage.jsx")) },
    { id: "orders", label: "Orders", icon: "file", path: "orders", phase: 5, roles: BOTH, element: lazy(() => import("../../pages/farm/FarmOrdersPage.jsx")) },
    { id: "fields", label: "Fields and land", icon: "building", path: "fields", phase: 4, roles: BOTH, element: lazy(() => import("../../pages/farm/FieldsPage.jsx")) },
    { id: "inventory", label: "Store and tools", icon: "building", path: "inventory", phase: 4, roles: BOTH, element: lazy(() => import("../../pages/farm/InventoryPage.jsx")) },
    { id: "livestock", label: "Livestock", icon: "users", path: "livestock", phase: 4, roles: BOTH, element: lazy(() => import("../../pages/farm/LivestockPage.jsx")) },
    { id: "money", label: "Income and expenses", icon: "card", path: "money", phase: 4, roles: BOTH, element: lazy(() => import("../../pages/farm/MoneyPage.jsx")) },
    { id: "tasks", label: "Tasks", icon: "check", path: "tasks", phase: 4, roles: BOTH, element: lazy(() => import("../../pages/farm/TasksPage.jsx")) },
    { id: "analytics", label: "Analytics", icon: "chart", path: "analytics", phase: 4, roles: BOTH, element: lazy(() => import("../../pages/farm/AnalyticsPage.jsx")) },
    { id: "reports", label: "Reports", icon: "chart", path: "reports", phase: 4, roles: OWNER, element: lazy(() => import("../../pages/reports/ReportsPage.jsx")) },
    { id: "settings", label: "Settings", icon: "settings", path: "settings", phase: 4, roles: OWNER, element: lazy(() => import("../../pages/farm/FarmSettingsPage.jsx")) },
  ],
});