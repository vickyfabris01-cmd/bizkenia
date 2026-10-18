// src/pages/people/NoticesPage.jsx — NEW FILE
//
// AIM
// /app/:slug/notices (resident, worker) — announcements meant for me, newest first, pinned ones on top.
// Opening a notice marks it read; unread ones are marked with a dot.

import { useState } from "react";
import { Alert, Badge, Card, CardBody, EmptyState, Skeleton } from "../../components/ui";
import useAsync from "../../hooks/useAsync.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { listAnnouncements, markAnnouncementRead } from "../../lib/api/people.js";
import { formatDate } from "../../lib/format.js";
import { PageHead } from "../rental/shared.jsx";

export default function NoticesPage() {
  const { business } = useBusinessContext();
  const { data, error, loading } = useAsync(() => listAnnouncements(business.id), [business.id]);
  const [seen, setSeen] = useState({});

  function read(a) {
    if (a.is_read || seen[a.id]) return;
    setSeen((s) => ({ ...s, [a.id]: true }));
    markAnnouncementRead(a.id);
  }
  return (
    <div className="rent">
      <PageHead title="Notices" lead={`Announcements from ${business.name}.`} />
      {error && <Alert type="error" message={error} />}
      {loading ? <><Skeleton height={96} /><Skeleton height={96} /></> : (data || []).length === 0 ? <Card><EmptyState icon="megaphone" compact title="No notices yet" /></Card> : (
        <div className="rent-notices">
          {data.map((a) => {
            const unread = !a.is_read && !seen[a.id];
            return (
              <Card key={a.id}>
                <CardBody>
                  <details onToggle={(e) => e.currentTarget.open && read(a)} open={unread && a.pinned}>
                    <summary className="rent-notice__sum">
                      {unread && <span className="rent-dot" aria-label="Unread" />}
                      <span className="rent-strong">{a.title}</span>
                      {a.pinned && <Badge variant="brand">Pinned</Badge>}
                      <span className="rent-muted">{formatDate(a.created_at)}</span>
                    </summary>
                    <p className="rent-notice__body">{a.body}</p>
                    {a.audience !== "all" && <p className="rent-muted">For {a.floor?.floor_name ? `${a.floor.floor_name} residents` : `${a.building?.name || "one building"} residents`}</p>}
                  </details>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
