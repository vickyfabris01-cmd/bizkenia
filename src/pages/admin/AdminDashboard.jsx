// src/pages/admin/AdminDashboard.jsx — NEW FILE
//
// AIM
// Platform admin dashboard: business counts by status, number of users, subscription revenue
// and the list of businesses waiting for review (the main daily job).

import "./Admin.css";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Button, Card, CardHeader, EmptyState, Skeleton } from "../../components/ui";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import useAsync from "../../hooks/useAsync.js";
import { adminListBusinesses, adminStats } from "../../lib/api/businesses.js";
import { formatDate, formatKsh } from "../../lib/format.js";
import { typeLabel } from "../../config/counties.js";

function Stat({ label, value, loading, to }) {
  const body = (
    <Card className="adm-stat">
      <span className="adm-stat__label">{label}</span>
      {loading ? <Skeleton width={60} height={28} /> : <span className="adm-stat__value">{value}</span>}
    </Card>
  );
  return to ? <Link to={to} className="adm-stat__link">{body}</Link> : body;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { data: s, loading: sl, error } = useAsync(() => adminStats(), []);
  const { data: pending, loading: pl } = useAsync(() => adminListBusinesses({ status: "pending" }), []);

  return (
    <div className="adm">
      <h2 className="adm__title">Dashboard</h2>
      {error && <Card><EmptyState icon="info" title="Could not load the numbers" description={error} compact /></Card>}
      <div className="adm-stats">
        <Stat label="Waiting for review" value={s?.pending} loading={sl} to="/admin/businesses?status=pending" />
        <Stat label="Active businesses" value={s?.active} loading={sl} to="/admin/businesses?status=active" />
        <Stat label="Needs changes" value={s?.rejected} loading={sl} to="/admin/businesses?status=rejected" />
        <Stat label="Suspended" value={s?.suspended} loading={sl} to="/admin/businesses?status=suspended" />
        <Stat label="Users" value={s?.users} loading={sl} to="/admin/users" />
        <Stat label="Subscription revenue" value={s ? formatKsh(s.revenue) : ""} loading={sl} />
      </div>

      <Card padding="none">
        <CardHeader title="Waiting for review" action={<Button as={Link} to="/admin/businesses" variant="ghost" size="sm">All businesses</Button>} />
        <SimpleTable loading={pl} rows={pending || []} onRowClick={(r) => navigate(`/admin/businesses/${r.id}`)}
          empty={<EmptyState icon="success" title="Nothing waiting" description="New businesses appear here after they pay." compact />}
          columns={[
            { key: "name", label: "Business", render: (r) => <strong>{r.name}</strong> },
            { key: "type", label: "Type", render: (r) => typeLabel(r.business_type) },
            { key: "county", label: "County" },
            { key: "submitted_at", label: "Submitted", render: (r) => formatDate(r.submitted_at) },
            { key: "status", label: "Status", render: () => <Badge variant="warning">Pending</Badge> },
          ]} />
      </Card>
    </div>
  );
}
