// src/pages/public/StaticPages.jsx — MODIFIED (Phase 6: the privacy page says how to delete your account and what stays)
//
// AIM
// The text pages: About, Contact, Terms, Privacy, Help. They are plain content on purpose;
// the legal wording is a DRAFT for the owner to review with a lawyer before launch. The
// product name and support email come from useBrand().

import { Link } from "react-router-dom";
import { Button, Card } from "../../components/ui";
import useBrand from "../../hooks/useBrand.js";

function Page({ title, lead, children }) {
  return (
    <div className="pg pg--narrow">
      <h1 className="pg__title">{title}</h1>
      {lead && <p className="pg__lead">{lead}</p>}
      {children}
    </div>
  );
}

export function AboutPage() {
  const { name } = useBrand();
  return (
    <Page title={`About ${name}`} lead="One place to run a business in Kenya, and one place for customers to find it.">
      <h2>What we do</h2>
      <p>{name} gives business owners tools to manage their work, take payments by M-Pesa and be found online. We start with rentals: apartments, hostels and rooms. Agriculture and shops follow.</p>
      <h2>How it is run</h2>
      <p>Every business has exactly one owner and can invite managers. Each business is checked and approved before it appears to the public.</p>
      <Button as={Link} to="/start" style={{ marginTop: 16 }}>List your business</Button>
    </Page>
  );
}

export function ContactPage() {
  const { name, supportEmail, mailto } = useBrand();
  return (
    <Page title="Contact us" lead={`Questions about ${name}? Write to us and we will reply by email.`}>
      <Card>
        <h2 style={{ marginTop: 0 }}>Email</h2>
        <p><a href={`${mailto}?subject=${encodeURIComponent(`Question about ${name}`)}`}>{supportEmail}</a></p>
        <p>Please include your account email and, for a business question, the business name.</p>
      </Card>
    </Page>
  );
}

export function TermsPage() {
  const { name } = useBrand();
  return (
    <Page title="Terms of use" lead="Draft for review. Last updated October 2026.">
      <h2>1. Using {name}</h2>
      <p>You must give true information, keep your password private and use the service lawfully.</p>
      <h2>2. Businesses</h2>
      <p>Each business has one owner who is responsible for what is listed and for the people they invite. {name} may reject, suspend or remove a business that breaks these terms.</p>
      <h2>3. Subscriptions and payments</h2>
      <p>Subscriptions are paid by M-Pesa at the price shown on the pricing page when you pay. A payment does not guarantee approval.</p>
      <h2>4. Liability</h2>
      <p>{name} provides tools and is not a party to agreements between businesses and their customers.</p>
    </Page>
  );
}

export function PrivacyPage() {
  const { name, supportEmail } = useBrand();
  return (
    <Page title="Privacy" lead="Draft for review. Last updated October 2026.">
      <h2>What we keep</h2>
      <p>Your name, email, phone number and the details of businesses you create, plus payment references from M-Pesa. We never see your M-Pesa PIN.</p>
      <h2>How it is used</h2>
      <p>To run your account, process subscriptions, show approved businesses to the public and contact you about your account.</p>
      <h2>Your choices</h2>
      <p>You can edit your details in My account, and you can delete your account yourself there, under Delete my account. It needs your password and takes effect at once: your profile, sign-in, messages and notifications are removed and cannot be recovered.</p>
      <p>Records you were part of, such as orders, rent and payment records, stay as history for the business that holds them, without your name. Delivery details you gave on past orders stay with the shop so it can finish and account for them. The platform keeps its own payment and subscription records for accounting.</p>
      <p>If you own a business, hand it over to a manager or delete the business before you delete your account. A deleted business is hidden at once and kept for 60 days so its owner can restore it, then it is deleted for good with its data. Questions? Write to {supportEmail}. {name} does not sell your personal data.</p>
    </Page>
  );
}

const FAQ = [
  ["How do I sign in?", "Use your email and password, your phone number and password, or Google. No SMS code is needed."],
  ["How do I list my business?", "Create an account, choose List your business, pick the business type, add your details and pay the subscription by M-Pesa. We then review your business."],
  ["How long does approval take?", "It depends on how the platform is set up. You will get a notification as soon as a decision is made, and you can follow the status on your business status page."],
  ["My business was rejected. What now?", "Open the status page, read the reason, update your details and send it again. You do not pay again."],
  ["My M-Pesa payment failed.", "Check that the phone number is right and has enough balance, then try again from the subscribe page. If money left your account, contact support with the M-Pesa message."],
  ["Can I own more than one business?", "Yes. Each business has its own subscription and you switch between them from My businesses."],
];

export function HelpPage() {
  const { supportEmail, mailto } = useBrand();
  return (
    <Page title="Help centre" lead="Answers to common questions.">
      <div className="faq">
        {FAQ.map(([q, a]) => (
          <details key={q}><summary>{q}</summary><p>{a}</p></details>
        ))}
      </div>
      <p style={{ marginTop: 24 }}>Still stuck? Email <a href={mailto}>{supportEmail}</a>.</p>
    </Page>
  );
}