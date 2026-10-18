// src/pages/help/AdminSupportPage.jsx — NEW FILE
//
// AIM
// /admin/support (super admin) — the support inbox and the help articles.
//   Tickets   every ticket from every person; filter by status; open one to reply and set Open/Waiting/Solved
//   Articles  write, edit, publish and delete the articles shown on /help
// Only platform data lives here: the super admin never sees any business's residents, money or messages.

import "../rental/Rental.css";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Badge, Button, Card, CardBody, EmptyState, Input, SelectInput, Skeleton, TextArea, Checkbox } from "../../components/ui";
import { Modal } from "../../components/modals/Modal.jsx";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import ChatThread from "../../components/chat/ChatThread.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { useSession } from "../../store/sessionStore.js";
import { deleteArticle, listArticles, listTickets, replyTicket, saveArticle, setTicketStatus, ticketMessages } from "../../lib/api/people.js";
import { formatDate } from "../../lib/format.js";
import { PageHead, Tabs, personName } from "../rental/shared.jsx";
import { TICKET_BADGE } from "./MyTicketsPage.jsx";

const AUDIENCES = ["everyone", "owners", "residents", "visitors"].map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

function TicketModal({ ticket, onClose, onChanged }) {
  const me = useSession((s) => s.user?.id);
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("pending");
  const load = useCallback(async () => { const r = await ticketMessages(ticket.id); setMsgs(r.data || []); setLoading(false); }, [ticket.id]);
  useEffect(() => { load(); }, [load]);
  async function send(text) {
    const { error } = await replyTicket(ticket.id, text, status);
    if (!error) { await load(); onChanged(); }
    return { error };
  }
  const view = msgs.map((m) => ({ id: m.id, mine: m.sender_id === me, body: m.body, created_at: m.created_at, name: personName(ticket.who) }));
  return (
    <Modal isOpen onClose={onClose} title={ticket.subject} size="lg" footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <div className="rent-form">
        <p className="rent-muted">{personName(ticket.who)} · {ticket.who?.email} · {ticket.category} · {formatDate(ticket.created_at)}</p>
        <SelectInput label="After my reply, mark as" value={status} onChange={setStatus}
          options={[{ value: "pending", label: "Waiting for the person" }, { value: "solved", label: "Solved" }, { value: "open", label: "Open" }]} />
        <ChatThread messages={view} loading={loading} onSend={send} placeholder="Write a reply" sendLabel="Reply" />
        {ticket.status !== "solved" && <div><Button size="sm" variant="outline" onClick={async () => { await setTicketStatus(ticket.id, "solved"); onChanged(); onClose(); }}>Mark solved without replying</Button></div>}
      </div>
    </Modal>
  );
}

function ArticleModal({ article, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState(article || { title: "", slug: "", body: "", category: "General", audience: "everyone", sort: 100, published: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    if (!f.title.trim() || !f.body.trim()) { setErr("Write a title and the article text."); return; }
    setBusy(true); setErr("");
    const { error } = await saveArticle({ ...f, slug: f.slug || slugify(f.title) });
    setBusy(false);
    if (error) { setErr(/duplicate/i.test(error) ? "Another article already uses that web name." : error); return; }
    toast.success("Article saved"); onDone(); onClose();
  }
  return (
    <Modal isOpen onClose={onClose} title={article ? "Edit article" : "New article"} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="art-form" loading={busy}>Save</Button></>}>
      <form id="art-form" className="rent-form" onSubmit={submit} noValidate>
        {err && <Alert type="error" message={err} />}
        <Input label="Title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <div className="rent-form__row">
          <Input label="Topic" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          <SelectInput label="Mainly for" value={f.audience} onChange={(v) => setF({ ...f, audience: v })} options={AUDIENCES} />
        </div>
        <TextArea label="Article text" rows={8} required value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        <div className="rent-form__row">
          <Input label="Order (smaller first)" type="number" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })} />
          <Checkbox label="Published" checked={!!f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} />
        </div>
      </form>
    </Modal>
  );
}

export default function AdminSupportPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState("tickets");
  const [status, setStatus] = useState("active");
  const tickets = useAsync(() => listTickets(), []);
  const articles = useAsync(() => listArticles(), []);
  const [art, setArt] = useState(null);
  const open = (tickets.data || []).find((t) => t.id === params.get("t"));
  const all = tickets.data || [];
  const rows = all.filter((t) => (status === "active" ? t.status !== "solved" : status === "solved" ? t.status === "solved" : true));

  const tcols = [
    { key: "s", label: "Subject", render: (t) => <span className="rent-strong">{t.subject}</span> },
    { key: "w", label: "From", render: (t) => personName(t.who) },
    { key: "c", label: "Topic", render: (t) => t.category },
    { key: "d", label: "Last activity", render: (t) => formatDate(t.last_message_at) },
    { key: "st", label: "Status", render: (t) => <Badge variant={TICKET_BADGE[t.status][0]}>{t.status === "pending" ? "Waiting for person" : TICKET_BADGE[t.status][1]}</Badge> },
  ];
  const acols = [
    { key: "t", label: "Title", render: (a) => <span className="rent-strong">{a.title}</span> },
    { key: "c", label: "Topic", render: (a) => a.category },
    { key: "u", label: "For", render: (a) => a.audience },
    { key: "p", label: "Published", render: (a) => <Badge variant={a.published ? "success" : "neutral"}>{a.published ? "Yes" : "Draft"}</Badge> },
    { key: "x", label: "", align: "right", render: (a) => <span onClick={(e) => e.stopPropagation()} role="presentation"><Button size="sm" variant="ghost" onClick={async () => {
      const { error } = await deleteArticle(a.id); if (error) toast.error(error); else { toast.success("Article deleted"); articles.reload(); } }}>Delete</Button></span> },
  ];

  return (
    <div className="pg">
      <div className="rent">
        <PageHead title="Support" lead="Tickets from people using the platform, and the help centre articles.">
          {tab === "articles" && <Button onClick={() => setArt("new")}>New article</Button>}
        </PageHead>
        <Tabs label="Support sections" value={tab} onChange={setTab} tabs={[{ value: "tickets", label: "Tickets", count: all.filter((t) => t.status !== "solved").length }, { value: "articles", label: "Help articles" }]} />
        {tab === "tickets" && (
          <>
            <Tabs label="Ticket status" value={status} onChange={setStatus} tabs={[{ value: "active", label: "Needs attention" }, { value: "solved", label: "Solved" }, { value: "all", label: "All" }]} />
            {tickets.error && <Alert type="error" message={tickets.error} />}
            <SimpleTable loading={tickets.loading} columns={tcols} rows={rows} onRowClick={(t) => setParams({ t: t.id })}
              empty={<Card><EmptyState icon="help" compact title="No tickets here" description="Tickets people send from the help centre appear in this list." /></Card>} />
          </>
        )}
        {tab === "articles" && <SimpleTable loading={articles.loading} columns={acols} rows={articles.data || []} onRowClick={setArt}
          empty={<Card><EmptyState icon="file" compact title="No articles yet" /></Card>} />}
        {open && <TicketModal ticket={open} onClose={() => setParams({})} onChanged={tickets.reload} />}
        {art && <ArticleModal article={art === "new" ? null : art} onClose={() => setArt(null)} onDone={articles.reload} />}
      </div>
    </div>
  );
}
