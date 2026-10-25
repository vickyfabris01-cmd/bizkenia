// src/modules/rental/index.js — MODIFIED FILE (Phase 4: Reports screen; agriculture now has its own module file)
//
// The rental module's navigation. Phase 2 builds the owner and manager screens (dashboard,
// properties, requests, residents, tenancies, billing, payments, invoices, managers, settings).
// A resident gets their own menu; those screens are Phase 3 and open the ComingSoon page until then.
// Paths may repeat across roles ("" is the dashboard for staff and "My home" for residents):
// the shell picks the item whose roles include the person's role.

import { lazy } from "react";
import { registerModule } from "../registry.js";

const BOTH = ["owner", "manager"];
const OWNER = ["owner"];
const RESIDENT = ["resident"];
const WORKER = ["worker"];
const ALL = ["owner", "manager", "resident", "worker"];
registerModule({
  type: "rental",
  label: "Rental",
  nav: [
    { id: "dashboard", label: "Dashboard", icon: "dashboard", path: "", end: true, phase: 1, roles: BOTH,
      element: lazy(() => import("../../pages/app/BusinessDashboard.jsx")) },
    { id: "properties", label: "Properties", icon: "building", path: "properties", phase: 2, roles: BOTH, element: lazy(() => import("../../pages/rental/PropertiesPage.jsx")) },
    { id: "rental-requests", label: "Rental requests", icon: "file", path: "rental-requests", phase: 2, roles: BOTH, element: lazy(() => import("../../pages/rental/RequestsPage.jsx")) },
    { id: "residents", label: "Residents", icon: "users", path: "residents", phase: 2, roles: BOTH, element: lazy(() => import("../../pages/rental/ResidentsPage.jsx")) },
    { id: "tenancies", label: "Tenancies", icon: "swap", path: "tenancies", phase: 2, roles: BOTH, element: lazy(() => import("../../pages/rental/TenanciesPage.jsx")) },
    { id: "billing", label: "Billing", icon: "card", path: "billing", phase: 2, roles: BOTH, element: lazy(() => import("../../pages/rental/BillingPage.jsx")) },
    { id: "payments", label: "Payments", icon: "card", path: "payments", phase: 2, roles: BOTH, element: lazy(() => import("../../pages/rental/PaymentsPage.jsx")) },
    { id: "invoices", label: "Invoices", icon: "file", path: "invoices", phase: 2, roles: BOTH, element: lazy(() => import("../../pages/rental/InvoicesPage.jsx")) },
    { id: "complaints", label: "Complaints", icon: "complaint", path: "complaints", phase: 3, roles: BOTH, element: lazy(() => import("../../pages/people/ComplaintsPage.jsx")) },
    { id: "transfers", label: "Room transfers", icon: "swap", path: "transfers", phase: 3, roles: BOTH, element: lazy(() => import("../../pages/people/TransfersPage.jsx")) },
    { id: "workforce", label: "Workforce", icon: "user", path: "workforce", phase: 3, roles: BOTH, element: lazy(() => import("../../pages/people/WorkforcePage.jsx")) },
    { id: "announcements", label: "Announcements", icon: "megaphone", path: "announcements", phase: 3, roles: BOTH, element: lazy(() => import("../../pages/people/AnnouncementsPage.jsx")) },
    { id: "share", label: "Share and promote", icon: "megaphone", path: "share", phase: 6, roles: BOTH, element: lazy(() => import("../../pages/shared/MarketingPage.jsx")) },
    { id: "messages", label: "Messages", icon: "user", path: "messages", phase: 3, roles: ALL, element: lazy(() => import("../../pages/people/MessagesPage.jsx")) },
    { id: "reports", label: "Reports", icon: "chart", path: "reports", phase: 4, roles: OWNER, element: lazy(() => import("../../pages/reports/ReportsPage.jsx")) },
    { id: "managers", label: "Managers", icon: "users", path: "managers", phase: 2, roles: OWNER, element: lazy(() => import("../../pages/rental/ManagersPage.jsx")) },
    { id: "settings", label: "Settings", icon: "settings", path: "settings", phase: 2, roles: OWNER, element: lazy(() => import("../../pages/rental/SettingsPage.jsx")) },

    // Resident menu
    { id: "resident-home", label: "My home", icon: "home", path: "", end: true, phase: 3, roles: RESIDENT, element: lazy(() => import("../../pages/people/ResidentHome.jsx")) },
    { id: "resident-room", label: "My room", icon: "building", path: "my-room", phase: 3, roles: RESIDENT, element: lazy(() => import("../../pages/people/MyRoomPage.jsx")) },
    { id: "resident-invoices", label: "My invoices", icon: "file", path: "my-invoices", phase: 3, roles: RESIDENT, element: lazy(() => import("../../pages/people/MyInvoicesPage.jsx")) },
    { id: "resident-complaints", label: "Complaints", icon: "complaint", path: "my-complaints", phase: 3, roles: RESIDENT, element: lazy(() => import("../../pages/people/MyComplaintsPage.jsx")) },
    { id: "resident-notices", label: "Notices", icon: "megaphone", path: "notices", phase: 3, roles: ["resident", "worker"], element: lazy(() => import("../../pages/people/NoticesPage.jsx")) },
    { id: "resident-transfer", label: "Move rooms", icon: "swap", path: "transfer", phase: 3, roles: RESIDENT, element: lazy(() => import("../../pages/people/TransferPage.jsx")) },

    // Worker menu
    { id: "worker-home", label: "My work", icon: "home", path: "", end: true, phase: 3, roles: WORKER, element: lazy(() => import("../../pages/people/WorkerHome.jsx")) },
    { id: "worker-pay", label: "My pay", icon: "card", path: "my-pay", phase: 3, roles: WORKER, element: lazy(() => import("../../pages/people/WorkerPayPage.jsx")) },
  ],
});

// Agriculture is registered in ../agriculture/index.js (Phase 4). The shop is not open yet.
registerModule({ type: "shop", label: "Shop", nav: [] });
