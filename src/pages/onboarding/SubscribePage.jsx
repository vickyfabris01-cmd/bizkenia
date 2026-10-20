// src/pages/onboarding/SubscribePage.jsx — MODIFIED (fixed plan durations: durations, savings and the open offer are shown)
//
// AIM
// Step 3: pick a plan and pay by M-Pesa. The screen sends an STK prompt to the phone, waits for
// the answer and then moves to the approval step. If the payment fails or is cancelled the
// person can retry. If M-Pesa is not configured on this environment (no Daraja credentials)
// the page says so, and a super admin gets a "Mark as paid (testing)" button so that testing
// is never blocked.

import "./Onboarding.css";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Badge, Button, Card, EmptyState, PhoneInput, Skeleton, Spinner } from "../../components/ui";
import Stepper from "./Stepper.jsx";
import { adminRecordPayment, getMyBusiness, plansForType } from "../../lib/api/businesses.js";
import { startStk, watchPayment } from "../../lib/mpesa.js";
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
  const [phase, setPhase] = useState("form"); // form | waiting | failed
  const [message, setMessage] = useState("");
  const [notConfigured, setNotConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const stop = useRef(null);

  useEffect(() => { setPhone((p) => p || cleanKenyanPhone(profile?.phone || "")); }, [profile?.phone]);
  useEffect(() => { if (plans?.length && !planId) setPlanId((plans.find((p) => p.kind === "standard") || plans[0]).id); }, [plans, planId]);
  useEffect(() => () => stop.current?.(), []);

  async function finish() {
    await useBusinessStore.getState().load(user.id, true);
    navigate(`/start/status?business=${slug}`, { replace: true });
  }

  async function pay(e) {
    e.preventDefault();
    const msg = vPhone(phone);
    setPhoneError(msg);
    if (msg || !planId) return;
    setBusy(true); setMessage(""); setNotConfigured(false);
    try {
      const res = await startStk({ purpose: "subscription", businessId: biz.id, planId, phone: toE164(phone) });
      setPhase("waiting");
      stop.current = watchPayment(res.intentId, (intent) => {
        if (intent.status === "success") { stop.current?.(); finish(); }
        else if (intent.status !== "pending") {
          setPhase("failed");
          setMessage(intent.status === "cancelled" ? "The payment was cancelled on the phone." :
            intent.status === "timeout" ? "We did not get an answer from M-Pesa in time." :
            intent.result_desc || "The payment did not go through.");
        }
      });
    } catch (err) {
      if (err.code === "NOT_CONFIGURED") setNotConfigured(true);
      setMessage(err.message);
    } finally { setBusy(false); }
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

      {phase === "waiting" ? (
        <Card>
          <div className="onb__wait" role="status">
            <Spinner size="lg" label="Waiting for payment" />
            <h2 style={{ margin: 0 }}>Check your phone</h2>
            <p style={{ margin: 0 }}>Enter your M-Pesa PIN on the prompt for {formatKsh(plan?.price_kes)}. This page updates by itself.</p>
          </div>
        </Card>
      ) : (
        <form onSubmit={pay} noValidate>
          {phase === "failed" && <Alert type="error" title="Payment not completed" message={message} />}
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
          {message && phase === "form" && <div style={{ marginTop: 16 }}><Alert type={notConfigured ? "warning" : "error"} title={notConfigured ? "M-Pesa is not set up here yet" : undefined} message={message} /></div>}
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
