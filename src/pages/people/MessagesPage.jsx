// src/pages/people/MessagesPage.jsx — NEW FILE
//
// AIM
// /app/:slug/messages (everyone in the business) — one-to-one threads with unread counts, live updates, and
// "New message" to start a thread. Residents and workers can message the owner and managers; owner and managers
// can message anyone in the business. /messages?c=<id> opens a thread (notification links use it).

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Avatar, Badge, Button, Card, CardBody, EmptyState, SelectInput, Skeleton } from "../../components/ui";
import { Modal } from "../../components/modals/Modal.jsx";
import ChatThread from "../../components/chat/ChatThread.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useSession } from "../../store/sessionStore.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { listMessages, markConversationRead, messageContacts, myConversations, sendMessage, startConversation, subscribeMessages } from "../../lib/api/people.js";
import { formatDate } from "../../lib/format.js";
import { PageHead } from "../rental/shared.jsx";

const ROLE = { owner: "Owner", manager: "Manager", resident: "Resident", worker: "Worker" };

export default function MessagesPage() {
  const { business } = useBusinessContext();
  const me = useSession((s) => s.user?.id);
  const [params, setParams] = useSearchParams();
  const convs = useAsync(() => myConversations(business.id), [business.id]);
  const [msgs, setMsgs] = useState([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pick, setPick] = useState("");
  const [err, setErr] = useState("");
  const current = params.get("c");
  const active = (convs.data || []).find((c) => c.id === current);

  const open = useCallback((id) => setParams(id ? { c: id } : {}), [setParams]);

  useEffect(() => {
    if (!current) { setMsgs([]); return undefined; }
    let alive = true;
    setLoadingMsgs(true);
    listMessages(current).then(async (r) => {
      if (!alive) return;
      setMsgs(r.data || []); setLoadingMsgs(false);
      await markConversationRead(current); convs.reload();
    });
    const off = subscribeMessages(current, (m) => {
      setMsgs((x) => (x.some((y) => y.id === m.id) ? x : [...x, m]));
      if (m.sender_id !== me) { markConversationRead(current); }
      convs.reload();
    });
    return () => { alive = false; off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  async function send(text) {
    const { error } = await sendMessage(current, text);
    if (!error) {
      const r = await listMessages(current);
      setMsgs(r.data || []); convs.reload();
    }
    return { error };
  }
  async function begin() {
    if (!pick) { setErr("Choose who to message."); return; }
    const { data, error } = await startConversation(business.id, pick);
    if (error) { setErr(error); return; }
    setShowNew(false); setPick(""); setErr(""); await convs.reload(); open(data);
  }
  const contacts = useAsync(() => (showNew ? messageContacts(business.id) : Promise.resolve({ data: [], error: null })), [showNew, business.id]);

  const view = msgs.map((m) => ({ id: m.id, mine: m.sender_id === me, body: m.body, created_at: m.created_at, name: active?.other_name || "" }));

  return (
    <div className="rent">
      <PageHead title="Messages" lead="Private messages inside this business."><Button onClick={() => setShowNew(true)}>New message</Button></PageHead>
      {convs.error && <Alert type="error" message={convs.error} />}
      <div className="rent-split">
        <Card>
          {convs.loading ? <CardBody><Skeleton height={48} /><Skeleton height={48} /></CardBody> : (convs.data || []).length === 0 ? <EmptyState icon="user" compact title="No messages yet" description="Press New message to start a conversation." /> : (
            <ul className="rent-convs">
              {convs.data.map((c) => (
                <li key={c.id}>
                  <button type="button" className="rent-conv" aria-current={c.id === current} onClick={() => open(c.id)}>
                    <Avatar name={c.other_name} src={c.other_avatar} size="md" />
                    <span className="rent-conv__main"><span className="rent-strong">{c.other_name} <small>{ROLE[c.other_role] || ""}</small></span>
                      <small>{c.last_message_preview || "No messages yet"}</small></span>
                    {c.unread > 0 && <Badge variant="brand">{c.unread}</Badge>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardBody>
            {!active ? <EmptyState icon="user" compact title="Choose a conversation" description="Pick one on the left, or start a new message." /> : (
              <>
                <p className="rent-strong" style={{ margin: "0 0 var(--space-3)" }}>{active.other_name} <small className="rent-muted">{ROLE[active.other_role] || ""} · since {formatDate(active.last_message_at)}</small></p>
                <ChatThread messages={view} loading={loadingMsgs} onSend={send} empty="Say hello." />
              </>
            )}
          </CardBody>
        </Card>
      </div>
      {showNew && (
        <Modal isOpen onClose={() => setShowNew(false)} title="New message" size="sm"
          footer={<><Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button><Button onClick={begin}>Open chat</Button></>}>
          <div className="rent-form">
            {err && <Alert type="error" message={err} />}
            <SelectInput label="To" value={pick} onChange={setPick} placeholder={contacts.loading ? "Loading…" : "Choose a person"}
              options={(contacts.data || []).map((p) => ({ value: p.user_id, label: `${p.full_name} (${ROLE[p.role] || p.role})` }))} />
          </div>
        </Modal>
      )}
    </div>
  );
}
