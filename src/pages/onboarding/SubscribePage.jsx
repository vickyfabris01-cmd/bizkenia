// src/pages/onboarding/SubscribePage.jsx — MODIFIED (Part 9: clear waiting states with status icons, "check again" after 90 s, maintenance notice)
//
// AIM
// Step 3: pick a plan and pay by M-Pesa. The screen sends an STK prompt to the phone, waits for
// the answer and then moves to the approval step. If the payment fails or is cancelled the
// person can retry. If M-Pesa is not configured on this environment (no Daraja credentials)
// the page says so, and a super admin gets a "Mark as paid (testing)" button so that testing
// is never blocked.
//
// Screens while paying (each has an SVG status icon and a sentence a screen reader reads out):
//   sending     the prompt is being sent to the phone
//   waiting     the prompt is on the phone, enter the PIN; after 90 seconds a "Check again" button appears
//   confirmed   the payment arrived; the page moves on to the approval step
//   failed      the payment did not go through, was cancelled on the phone, or no answer came in time
// While payments are in maintenance (level 4 or 5) the server refuses the prompt and a notice says so.

import "./Onboarding.css";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Badge, Button, Card, EmptyState, Icon, PhoneInput, Skeleton, Spinner } from "../../components/ui";
import PlatformIcon from "../../components/ui/icons/PlatformIcons.jsx";
import Stepper from "./Stepper.jsx";
import { adminRecordPayment, getMyBusiness, plansForType } from "../../lib/api/businesses.js";
import { checkPayment, startStk, watchPayment } from "../../lib/mpesa.js";
import { billingBlurb, formatDate, formatKsh } from "../../lib/format.js";
import { cleanKenyanPhone } from "../../components/ui/PhoneInput.jsx";
import { toE164 } from "../../lib/phone.js";
import { phone as vPhone } from "../../lib/validate.js";
import { useBusinessStore } from "../../store/businessStore.js";
import { useSession } from "../../store/sessionStore.js";
import useAsync from "../../hooks/useAsync.js";

export default function SubscribePage() {
  const [params] = useSearchParams();
  const slug = params.get("business");
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const profile = useSession((s) => s.profile);
  const isAdmin = profile?.role === "super_admin";

  const { data: biz, error: bizError, loading: bizLoading } = useAsync(() => (slug ? getMyBusiness(slug) : Promise.resolve({ data: null, error: "No business chosen." })), [slug]);
  const { data: plans, loading: plansLoading } = useAsync(
    () => (biz ? plansForType(biz.business_type) : Promise.resolve({ data: [], error: null })), [biz?.business_type]);

  const [planId, setPlanId] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [phase, setPhase] = useState("form"); // form | sending | waiting | confirmed | failed
  const [outcome, setOutcome] = useState("failed"); // failed | cancelled | timeout (used when phase is "failed")
  const [slow, setSlow] = useState(false); // 90 seconds have passed and the answer has not come
  const [checking, setChecking] = useState(false);
  const [paused, setPaused] = useState(false); // payments are in maintenance
  const [message, setMessage] = useState("");
  const [notConfigured, setNotConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const stop = useRef(null);
  const intentRef = useRef(null);
  const moveOn = useRef(null);

  useEffect(() => { setPhone((p) => p || cleanKenyanPhone(profile?.phone || "")); }, [profile?.phone]);
  useEffect(() => { if (plans?.length && !planId) setPlanId((plans.find((p) => p.kind === "standard") || plans[0]).id); }, [plans, planId]);
  useEffect(() => () => { stop.current?.(); clearTimeout(moveOn.current); }, []);
  useEffect(() => {
    if (phase !== "waiting") return undefined;
    const t = setTimeout(() => setSlow(true), 90000);
    return () => clearTimeout(t);
  }, [phase]);

  async function finish() {
    await useBusinessStore.getState().load(user.id, true);
    navigate(`/start/status?business=${slug}`, { replace: true });
  }

  // One place that turns an answer from mpesa-status into a screen (used by the watcher and by "Check again").
  function apply(intent) {
    if (intent.status === "success") {
      stop.current?.();
      setPhase("confirmed");
      moveOn.current = setTimeout(finish, 1500);
    } else if (intent.status !== "pending") {
      stop.current?.();
      setOutcome(intent.status === "cancelled" ? "cancelled" : intent.status === "timeout" ? "timeout" : "failed");
      setMessage(intent.status === "cancelled" ? "The payment was cancelled on the phone. Nothing was charged." :
        intent.status === "timeout" ? "We did not get an answer from M-Pesa in time. If money was taken from your phone, it will be confirmed here within a few minutes." :
        intent.result_desc || "The payment did not go through.");
      setPhase("failed");
    }
  }

  async function pay(e) {
    e.preventDefault();
    if (busy) return; // a double tap must not send a second prompt
    const msg = vPhone(phone);
    setPhoneError(msg);
    if (msg || !planId) return;
    setBusy(true); setMessage(""); setNotConfigured(false); setPaused(false); setSlow(false);
    setPhase("sending");
    try {
      const res = await startStk({ purpose: "subscription", businessId: biz.id, planId, phone: toE164(phone) });
      intentRef.current = res.intentId;
      setPhase("waiting");
      stop.current = watchPayment(res.intentId, apply);
    } catch (err) {
      setPhase("form");
      if (err.code === "NOT_CONFIGURED") setNotConfigured(true);
      else if (String(err.code || "").startsWith("MAINTENANCE")) setPaused(true);
      setMessage(err.message);
    } finally { setBusy(false); }
  }

  // "Still waiting? Check again": the same status check the page already polls with, asked once more.
  async function checkAgain() {
    if (!intentRef.current || checking) return;
    setChecking(true);
    const intent = await checkPayment(intentRef.current);
    setChecking(false);
    if (intent) apply(intent);
  }

  function tryAgain() {
    stop.current?.();
    setPhase("form"); setMessage(""); setSlow(false);
  }

  async function markPaid() {
    setBusy(true);
    const { error } = await adminRecordPayment(biz.id, planId, "TEST-" + Date.now().toString(36).toUpperCase(), "Marked as paid during testing");
    setBusy(false);
    if (error) return setMessage(error);
    finish();
  }

  if (bizLoading) return <div className="pg pg--narrow"><Skeleton height={32} /><Skeleton height={80} style={{ marginTop: 16 }} /></div>;
  if (bizError || !biz) {
    return <div className="pg pg--narrow"><Card><EmptyState icon="search" title="Business not found" description={bizError || "Start again from the beginning."}
      action={<Button as={Link} to="/start">Start again</Button>} /></Card></div>;
  }
  if (biz.status !== "pending_payment" && biz.status !== "draft") return <Navigate to={`/start/status?business=${biz.slug}`} replace />;

  const plan = (plans || []).find((p) => p.id === planId);

  return (
    <div className="pg pg--narrow">
      <Stepper step={3} />
      <h1 className="pg__title">Choose a subscription</h1>
      <p className="pg__lead">For <strong>{biz.name}</strong>. You pay by M-Pesa; approval comes next.</p>

      {phase !== "form" ? (
        <Card>
          <div className="onb__wait" role="status" aria-live="polite">
            {phase === "sending" && (<>
              <span className="onb__state onb__state--busy"><Spinner size="lg" label="Sending the prompt" /></span>
              <h2 style={{ margin: 0 }}>Sending the prompt</h2>
              <p style={{ margin: 0 }}>We are asking M-Pesa to send a payment prompt to your phone. Please do not close this page.</p>
            </>)}
            {phase === "waiting" && (<>
              <span className="onb__state onb__state--wait"><PlatformIcon name="phone" size={32} /></span>
              <h2 style={{ margin: 0 }}>Check your phone</h2>
              <p style={{ margin: 0 }}>Enter your M-Pesa PIN on the prompt for {formatKsh(plan?.price_kes)}. This page updates by itself.</p>
              {slow && (<>
                <p style={{ margin: 0 }}>Still waiting. If you have already entered your PIN, check again.</p>
                <Button type="button" variant="outline" loading={checking} onClick={checkAgain} leftIcon={<PlatformIcon name="refresh" size={16} />}>Check again</Button>
              </>)}
            </>)}
            {phase === "confirmed" && (<>
              <span className="onb__state onb__state--ok"><Icon name="success" size={32} /></span>
              <h2 style={{ margin: 0 }}>Payment confirmed</h2>
              <p style={{ margin: 0 }}>Thank you. Taking you to the approval step.</p>
            </>)}
            {phase === "failed" && (<>
              <span className={`onb__state ${outcome === "timeout" ? "onb__state--wait" : "onb__state--bad"}`}>
                {outcome === "cancelled" ? <Icon name="x" size={32} /> : outcome === "timeout" ? <PlatformIcon name="clock" size={32} /> : <Icon name="error" size={32} />}
              </span>
              <h2 style={{ margin: 0 }}>{outcome === "cancelled" ? "Payment cancelled" : outcome === "timeout" ? "No answer yet" : "Payment not completed"}</h2>
              <p style={{ margin: 0 }}>{message}</p>
              <div className="onb__actions">
                {outcome === "timeout" && <Button type="button" variant="outline" loading={checking} onClick={checkAgain} leftIcon={<PlatformIcon name="refresh" size={16} />}>Check again</Button>}
                <Button type="button" onClick={tryAgain}>Try again</Button>
              </div>
            </>)}
          </div>
        </Card>
      ) : (
        <form onSubmit={pay} noValidate>
          {plansLoading ? <Skeleton height={72} /> : (plans || []).length === 0 ? (
            <Alert type="warning" message="No subscription is available for this type yet. Please contact support." />
          ) : (
            <div className="onb__plans" role="radiogroup" aria-label="Plans">
              {plans.map((p) => (
                <label key={p.id} className="onb__plan">
                  <input type="radio" name="plan" value={p.id} checked={planId === p.id} onChange={() => setPlanId(p.id)} />
                  <span>
                    <span className="onb__plan-name">
                      {p.kind === "offer" ? p.name : p.duration_label}
                      {p.kind === "offer" && <> <Badge variant="warning" size="sm">Offer</Badge></>}
                    </span>
                    <span className="onb__plan-desc">
                      {p.kind === "offer" ? `${p.duration_label}. ` : ""}{billingBlurb(p.months)}
                      {p.kind === "offer" && p.offer_ends_on ? `. Ends ${formatDate(p.offer_ends_on)}` : ""}
                    </span>
                    {p.description && <span className="onb__plan-desc">{p.description}</span>}
                  </span>
                  <span className="onb__plan-price">
                    {formatKsh(p.price_kes)}
                    <small>{p.months === 1 ? "per month" : `for ${p.months} months`}</small>
                    {p.months > 1 && p.saving_kes > 0 && <span className="onb__plan-save">Save {formatKsh(p.saving_kes)} ({p.saving_percent}%)</span>}
                  </span>
                </label>
              ))}
            </div>
          )}
          <PhoneInput label="M-Pesa phone number" required value={phone} onChange={setPhone} error={phoneError}
            helper="The number that will receive the payment prompt." />
          {message && phase === "form" && <div style={{ marginTop: 16 }}><Alert type={notConfigured || paused ? "warning" : "error"} title={notConfigured ? "M-Pesa is not set up here yet" : paused ? "Payments are paused" : undefined} message={message} /></div>}
          {notConfigured && isAdmin && (
            <div style={{ marginTop: 16 }}>
              <Button type="button" variant="secondary" loading={busy} onClick={markPaid}>Mark as paid (testing)</Button>
            </div>
          )}
          {notConfigured && !isAdmin && <p style={{ marginTop: 12 }}>Ask the platform administrator to record your payment, or try again later.</p>}
          <div className="onb__actions" style={{ marginTop: 24 }}>
            <Button type="button" variant="ghost" onClick={() => navigate(`/businesses`)}>Pay later</Button>
            <Button type="submit" size="lg" loading={busy} disabled={!plan}>{plan ? `Pay ${formatKsh(plan.price_kes)} with M-Pesa` : "Pay with M-Pesa"}</Button>
          </div>
        </form>
      )}
    </div>
  );
}
