// src/pages/admin/AdminUsers.jsx — NEW FILE
//
// AIM
// Everyone with an account: name, email, phone, role and whether the account is active.
// A super admin can switch an account off and on (never their own, never another super admin).

import "./Admin.css";
import { useState } from "react";
import { Alert, Badge, Button, Card, EmptyState, Input } from "../../components/ui";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { adminListUsers, adminSetUserActive } from "../../lib/api/businesses.js";
import { formatDate } from "../../lib/format.js";
import { useSession } from "../../store/sessionStore.js";

const ROLE_TEXT = { super_admin: "Super admin", owner: "Owner", manager: "Manager", visitor: "Member", client: "Resident", worker: "Worker" };

export default function AdminUsers() {
  const toast = useToast();
  const me = useSession((s) => s.user?.id);
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const { data, error, loading, reload } = useAsync(() => adminListUsers({ search: term }), [term]);

  async function toggle(u) {
    const { error: e } = await adminSetUserActive(u.id, !u.is_active);
    if (e) return toast.error(e);
    toast.success(u.is_active ? "Account switched off. The person is signed out and cannot sign in." : "Account switched on.");
    reload();
  }

  return (
    <div className="adm">
      <h2 className="adm__title">Users</h2>
      <form className="adm__bar" role="search" onSubmit={(e) => { e.preventDefault(); setTerm(q.trim()); }}>
        <Input label="Search" placeholder="Name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" style={{ flex: "0 0 auto" }}>Search</Button>
      </form>
      {error && <Alert type="error" message={error} />}
      <SimpleTable loading={loading} rows={data || []}
        empty={<Card><EmptyState icon="users" title="No users found" compact /></Card>}
        columns={[
          { key: "full_name", label: "Name", render: (u) => <strong>{u.full_name || "-"}</strong> },
          { key: "email", label: "Email" },
          { key: "phone", label: "Phone", render: (u) => u.phone || "-" },
          { key: "role", label: "Role", render: (u) => <Badge variant={u.role === "super_admin" ? "brand" : "neutral"}>{ROLE_TEXT[u.role] || u.role}</Badge> },
          { key: "created_at", label: "Joined", render: (u) => formatDate(u.created_at) },
          { key: "is_active", label: "Account", align: "right", render: (u) => (u.id === me || u.role === "super_admin") ? <Badge variant="success">Active</Badge> :
            <Button size="sm" variant={u.is_active ? "outline" : "primary"} onClick={() => toggle(u)}>{u.is_active ? "Switch off" : "Switch on"}</Button> },
        ]} />
    </div>
  );
}
