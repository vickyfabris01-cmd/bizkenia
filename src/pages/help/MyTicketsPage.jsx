// src/pages/help/MyTicketsPage.jsx — NEW FILE
//
// AIM
// /help/tickets — my support tickets: the list with status, the conversation with the support team, a reply box,
// "Mark as solved", and a new-ticket form. /help/tickets?t=<id> opens one (notification links use it).

import "../rental/Rental.css";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, Skeleton } from "../../components/ui";
import ChatThread from "../../components/chat/ChatThread.jsx";
import TicketForm from "../../components/support/TicketForm.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useSession } from "../../store/sessionStore.js";
import { listTickets, replyTicket, setTicketStatus, ticketMessages } from "../../lib/api/people.js";
import { formatDate } from "../../lib/format.js";

export const TICKET_BADGE = { open: ["warning", "Open"], pending: ["info", "Support replied"], solved: ["success", "Solved"] };

export default function MyTicketsPage() {
  const me = useSession((s) => s.user?.id);
  const [params, setParams] = useSearchParams();
  const { data, error, loading, reload } = useAsync(() => listTickets(), []);
  const [msgs, setMsgs] = useState([]);
  const [mLoading, setMLoading] = useState(false);
  const current = params.get("t");
  const ticket = (data || []).find((t) => t.id === current);

  const load = useCallback(async () => {
    if (!current) return;
    setMLoading(true);
    const r = await ticketMessages(current);
    setMsgs(r.data || []); setMLoading(false);
  }, [current]);
  useEffect(() => { load(); }, [load]);

  async function send(text) {
    const { error: e } = await replyTicket(current, text);
    if (!e) { await load(); reload(); }
    return { error: e };
  }
  async function solve() { await setTicketStatus(current, "solved"); reload(); }
  const view = msgs.map((m) => ({ id: m.id, mine: m.sender_id === me, body: m.body, created_at: m.created_at, name: "Support team", badge: "Staff" }));

  return (
    <div className="pg">
      <h1 className="pg__title">My tickets</h1>
      <div className="rent">
        {error && <Alert type="error" message={error} />}
        <div className="rent-split">
          <div style={{ display: "grid", gap: "var(--space-4)" }}>
            <Card>
              {loading ? <CardBody><Skeleton height={48} /><Skeleton height={48} /></CardBody> : (data || []).length === 0 ? <EmptyState icon="help" compact title="No tickets yet" description="Write to support below." /> : (
                <ul className="rent-convs">
                  {data.map((t) => (
                    <li key={t.id}><button type="button" className="rent-conv" aria-current={t.id === current} onClick={() => setParams({ t: t.id })}>
                      <span className="rent-conv__main"><span className="rent-strong">{t.subject}</span><small>{formatDate(t.last_message_at)}</small></span>
                      <Badge variant={TICKET_BADGE[t.status][0]}>{TICKET_BADGE[t.status][1]}</Badge></button></li>
                  ))}
                </ul>
              )}
            </Card>
            <Card><CardHeader title="New ticket" /><CardBody><TicketForm onCreated={(id) => { reload(); setParams({ t: id }); }} /></CardBody></Card>
          </div>
          <Card>
            <CardBody>
              {!ticket ? <EmptyState icon="help" compact title="Choose a ticket" description="Pick one on the left to read the replies." /> : (
                <>
                  <p className="rent-strong" style={{ margin: "0 0 var(--space-3)" }}>{ticket.subject}{" "}
                    {ticket.status !== "solved" && <Button size="sm" variant="ghost" onClick={solve}>Mark as solved</Button>}</p>
                  <ChatThread messages={view} loading={mLoading} onSend={send} placeholder="Write a reply" sendLabel="Reply" />
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
