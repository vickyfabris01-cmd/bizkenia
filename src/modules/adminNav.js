// src/modules/adminNav.js — MODIFIED (new "Unused files" menu item after Traffic)
// The platform admin menu. Items without `element` open the ComingSoon page naming the phase.
import { lazy } from "react";

export const ADMIN_NAV = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard", path: "", end: true, phase: 1, element: lazy(() => import("../pages/admin/AdminDashboard.jsx")) },
  { id: "businesses", label: "Businesses", icon: "building", path: "businesses", phase: 1, element: lazy(() => import("../pages/admin/AdminBusinesses.jsx")) },
  { id: "users", label: "Users", icon: "users", path: "users", phase: 1, element: lazy(() => import("../pages/admin/AdminUsers.jsx")) },
  { id: "transactions", label: "Transactions", icon: "card", path: "transactions", phase: 5, element: lazy(() => import("../pages/admin/AdminTransactions.jsx")) },
  { id: "revenue", label: "Revenue", icon: "dashboard", path: "revenue", phase: 5, element: lazy(() => import("../pages/admin/AdminRevenue.jsx")) },
  { id: "reports", label: "Reports", icon: "chart", path: "reports", phase: 5, element: lazy(() => import("../pages/admin/AdminReports.jsx")) },
  { id: "audit", label: "Audit log", icon: "file", path: "audit", phase: 5, element: lazy(() => import("../pages/admin/AdminAudit.jsx")) },
  { id: "errors", label: "App errors", icon: "warning", path: "errors", phase: 5, element: lazy(() => import("../pages/admin/AdminErrors.jsx")) },
  { id: "traffic", label: "Traffic", icon: "chart", path: "traffic", phase: 5, element: lazy(() => import("../pages/admin/AdminTraffic.jsx")) },
  { id: "files", label: "Unused files", icon: "file", path: "files", phase: 5, element: lazy(() => import("../pages/admin/AdminFiles.jsx")) },
  { id: "share", label: "Share the site", icon: "megaphone", path: "share", phase: 6, element: lazy(() => import("../pages/admin/AdminShare.jsx")) },
  { id: "support", label: "Support", icon: "help", path: "support", phase: 3, element: lazy(() => import("../pages/help/AdminSupportPage.jsx")) },
  { id: "settings", label: "Settings", icon: "settings", path: "settings", phase: 1, element: lazy(() => import("../pages/admin/AdminSettings.jsx")) },
];
