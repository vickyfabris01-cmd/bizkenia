// src/components/chat/ChatThread.jsx — NEW FILE
//
// AIM
// A message thread with a composer, used for resident messages, complaint replies and support tickets.
// Shows bubbles (mine on the right), the time, and keeps the newest message in view.
//
// PROPS
//   messages   [{ id, mine, name, body, created_at, badge? }]   oldest first
//   onSend(text)  returns { error } (or nothing); the text box clears on success
//   disabled / disabledNote   hide the composer and show a note (e.g. a closed ticket)
//   placeholder, sendLabel, loading, empty

import "./Chat.css";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Skeleton } from "../ui";
import { formatDateTime } from "../../lib/format.js";

export default function ChatThread({ messages = [], onSend, disabled = false, disabledNote, placeholder = "Write a message", sendLabel = "Send", loading = false, empty = "No messages yet." }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView?.({ block: "end" }); }, [messages.length]);

  async function submit(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setError("");
    const res = await onSend(body);
    setBusy(false);
    if (res?.error) { setError(res.error); return; }
    setText("");
  }
  function onKey(e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(e); }

  return (
    <div className="chat">
      <div className="chat__log" role="log" aria-live="polite" aria-label="Messages">
        {loading ? <><Skeleton height={44} /><Skeleton height={44} /></> : messages.length === 0 ? <p className="chat__empty">{empty}</p> :
          messages.map((m) => (
            <div key={m.id} className={`chat__msg${m.mine ? " is-mine" : ""}`}>
              <div className="chat__bubble">
                {!m.mine && <span className="chat__name">{m.name}{m.badge && <span className="chat__badge">{m.badge}</span>}</span>}
                <p>{m.body}</p>
                <time dateTime={m.created_at}>{formatDateTime(m.created_at)}</time>
              </div>
            </div>
          ))}
        <div ref={endRef} />
      </div>
      {disabled ? (disabledNote && <p className="chat__note">{disabledNote}</p>) : (
        <form className="chat__form" onSubmit={submit}>
          {error && <Alert type="error" message={error} />}
          <label className="chat__label" htmlFor="chat-text">{placeholder}</label>
          <textarea id="chat-text" className="chat__input" rows={2} maxLength={2000} value={text} placeholder={placeholder}
            onChange={(e) => setText(e.target.value)} onKeyDown={onKey} />
          <Button type="submit" loading={busy} disabled={!text.trim()}>{sendLabel}</Button>
        </form>
      )}
    </div>
  );
}
