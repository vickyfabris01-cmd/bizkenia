// src/pages/preview/PreviewPage.jsx — NEW FILE (TEMPORARY, a developer testing page)
//
// AIM
// One place to see and try every shared piece built so far, inside the real app shell:
// buttons, form fields, badges, cards, avatars, toasts, modals, loading states, colour tokens
// and icons. Use it to check light/dark mode and phone/tablet/desktop layouts after any change
// to tokens or components. It uses dummy data only and talks to no server.
//
// Routes (see router/AppRouter.jsx):
//   /preview                  goes to /preview/components
//   /preview/components       buttons, badges, cards, avatars, tooltip
//   /preview/forms            every form field, with a small validation demo
//   /preview/feedback         alerts, toasts, modal, drawer, confirm dialog
//   /preview/loading          spinner, skeletons, empty state
//   /preview/tokens           colour tokens
//   /preview/icons            the icon set
//
// Remove this file (and its route) before the first public release.

import "./PreviewPage.css";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import AppShell from "../../components/shell/AppShell.jsx";
import {
  Alert,
  Avatar,
  AvatarGroup,
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Checkbox,
  Divider,
  EmptyState,
  Input,
  PasswordInput,
  PhoneInput,
  SelectInput,
  Skeleton,
  SkeletonCard,
  SkeletonTable,
  Spinner,
  TextArea,
  Toggle,
  Tooltip,
} from "../../components/ui/index.js";
import Icon, { ICON_NAMES } from "../../components/ui/Icon.jsx";
import { ConfirmDialog, Drawer, Modal } from "../../components/modals/Modal.jsx";
import { useToast } from "../../hooks/useNotifications.js";

// ── Dummy shell data ──────────────────────────────────────────────────────────
const NAV = [
  { to: "/preview/components", label: "Basics", icon: "dashboard" },
  { to: "/preview/forms", label: "Forms", icon: "file" },
  { to: "/preview/feedback", label: "Feedback", icon: "bell" },
  { to: "/preview/loading", label: "Loading", icon: "chart" },
  { to: "/preview/tokens", label: "Tokens", icon: "settings", section: "Foundations" },
  { to: "/preview/icons", label: "Icons", icon: "building" },
  { to: "/preview/shell", label: "Shell notes", icon: "help" },
];

const USER = { name: "Amina Wanjiru", email: "amina@example.com", role: "owner" };
const BUSINESS = { name: "Green Valley Apartments", subtitle: "Rental" };

/** The page frame used by every /preview/* route. */
export default function PreviewLayout() {
  const toast = useToast();
  return (
    <AppShell
      nav={NAV}
      user={USER}
      business={BUSINESS}
      unreadCount={3}
      bellTo="/preview/feedback"
      profileTo="/preview/forms"
      onSwitchBusiness={() => toast.info("Switching business is not connected yet.")}
      onSignOut={() => toast.info("Sign out is not connected yet.")}
    />
  );
}

function Block({ title, note, children }) {
  return (
    <Card className="pv-block">
      <CardHeader title={title} subtitle={note} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

// ── Sections ──────────────────────────────────────────────────────────────────
function ComponentsSection() {
  return (
    <>
      <Block title="Buttons" note="Variants, sizes and states">
        <div className="pv-row">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Delete</Button>
        </div>
        <div className="pv-row">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="pv-row">
          <Button leftIcon={<Icon name="plus" size={18} />}>Add property</Button>
          <Button variant="outline" rightIcon={<Icon name="chevron-right" size={18} />}>
            Continue
          </Button>
          <Button as={Link} to="/" variant="secondary">
            Link to Home
          </Button>
        </div>
        <Button fullWidth>Full width</Button>
      </Block>

      <Block title="Badges" note="Status colours come from tokens">
        <div className="pv-row">
          <Badge>Neutral</Badge>
          <Badge variant="brand">Brand</Badge>
          <Badge variant="success">Active</Badge>
          <Badge variant="warning">Pending</Badge>
          <Badge variant="error">Overdue</Badge>
          <Badge variant="info">New</Badge>
          <Badge size="sm">Small</Badge>
          <Badge size="lg">Large</Badge>
        </div>
      </Block>

      <Block title="Cards" note="Plain, with header and footer, and clickable">
        <div className="pv-grid">
          <Card>
            <CardHeader title="Total revenue" action={<Badge variant="success">+12%</Badge>} />
            <CardBody>
              <p className="pv-stat">KSh 245,890</p>
              <p className="pv-muted">from last month</p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Unit 4B" subtitle="Green Valley Apartments" />
            <CardBody>Two bedrooms, second floor.</CardBody>
            <CardFooter>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
              <Button size="sm">Save</Button>
            </CardFooter>
          </Card>
          <Card as="a" href="#clickable" interactive>
            <CardHeader title="Clickable card" subtitle="Hover or focus me" />
            <CardBody>Lifts slightly and shows a focus ring for keyboards.</CardBody>
          </Card>
        </div>
      </Block>

      <Block title="Avatars and tooltip">
        <div className="pv-row">
          <Avatar name="Amina Wanjiru" size="xs" />
          <Avatar name="Amina Wanjiru" />
          <Avatar name="Brian Otieno" size="md" />
          <Avatar name="Cate Kamau" size="lg" />
          <Avatar name="Dan Odhiambo" size="xl" />
          <AvatarGroup
            people={[
              { name: "Amina Wanjiru" },
              { name: "Brian Otieno" },
              { name: "Cate Kamau" },
              { name: "Dan Odhiambo" },
              { name: "Eve Njeri" },
              { name: "Faith Achieng" },
            ]}
          />
          <Tooltip content="Tooltips show on hover and keyboard focus">
            <Button variant="outline" size="sm">
              Hover or focus me
            </Button>
          </Tooltip>
        </div>
        <Divider label="or" />
        <Divider />
      </Block>
    </>
  );
}

function FormsSection() {
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState("m-pesa");
  const [sms, setSms] = useState(true);
  const [terms, setTerms] = useState(false);
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const emailError = submitted && !/^\S+@\S+\.\S+$/.test(email) ? "Enter a valid email address" : undefined;
  const termsError = submitted && !terms ? "You need to accept the terms to continue" : undefined;

  const submit = (event) => {
    event.preventDefault();
    setSubmitted(true);
    if (/^\S+@\S+\.\S+$/.test(email) && terms) toast.success("The form is valid.", "Saved");
    else toast.error("Please fix the highlighted fields.", "Check the form");
  };

  return (
    <>
      <Block title="Text fields" note="Label, helper, error, icon and disabled states">
        <div className="pv-stack">
          <Input label="Full name" placeholder="Jane Doe" required helper="As on your ID" />
          <Input label="Search" leftAdornment={<Icon name="search" size={18} />} placeholder="Search residents…" />
          <Input label="With an error" defaultValue="wrong value" error="This value is not valid" />
          <Input label="Disabled" defaultValue="Locked" disabled />
          <Input label="Rent amount" type="number" placeholder="0" rightAdornment={<span>KSh</span>} />
          <Input label="Move-in date" type="date" />
          <TextArea label="Notes" placeholder="Anything else we should know?" />
        </div>
      </Block>

      <Block title="Password, phone and select" note="PhoneInput hands back the cleaned number">
        <div className="pv-stack">
          <PasswordInput label="New password" showStrength value={password} onChange={(e) => setPassword(e.target.value)} />
          <PhoneInput label="Phone number" value={phone} onChange={setPhone} helper={`Stored as: ${phone || "(empty)"}. Try 0712 345 678`} />
          <SelectInput
            label="Payment method"
            value={method}
            onChange={setMethod}
            options={[
              { value: "m-pesa", label: "M-Pesa" },
              { value: "cash", label: "Cash" },
              { value: "bank", label: "Bank transfer" },
            ]}
          />
          <SelectInput label="With a placeholder" placeholder="Choose a business type" value="" onChange={() => {}} options={["Rental", "Shop", "Farm"]} />
        </div>
      </Block>

      <Block title="Checkbox and toggle" note="Toggle gives back true or false">
        <div className="pv-stack">
          <Checkbox label="Remember me" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
          <Toggle label="Send SMS to each resident" checked={sms} onChange={setSms} />
          <Toggle label="A disabled switch" checked disabled onChange={() => {}} />
        </div>
      </Block>

      <Block title="A small form" note="Submit it empty to see the errors, then fix them">
        <form className="pv-stack" onSubmit={submit} noValidate>
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={emailError} required />
          <Checkbox label="I agree to the terms and conditions" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
          {termsError && <Alert type="error" message={termsError} />}
          <Button type="submit">Submit</Button>
        </form>
      </Block>
    </>
  );
}

function FeedbackSection() {
  const toast = useToast();
  const [modal, setModal] = useState(false);
  const [tall, setTall] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alertOpen, setAlertOpen] = useState(true);

  const runConfirm = () => {
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      setConfirm(false);
      toast.success("The property was deleted.", "Deleted");
    }, 1200);
  };

  return (
    <>
      <Block title="Alerts" note="Inline messages inside a page or form">
        <div className="pv-stack">
          <Alert type="info" title="Heads up" message="Rent is due on the 5th of every month." />
          <Alert type="success" message="Your changes were saved." />
          <Alert type="warning" title="Careful" message="Two units have no rent amount set." />
          <Alert type="error" title="Payment failed" message="The M-Pesa request timed out. Try again." />
          {alertOpen && <Alert type="info" message="This one can be dismissed." onClose={() => setAlertOpen(false)} />}
        </div>
      </Block>

      <Block title="Toasts" note="Errors stay until closed; the others disappear on their own">
        <div className="pv-row">
          <Button variant="secondary" onClick={() => toast.success("Payment recorded.", "Success")}>Success</Button>
          <Button variant="secondary" onClick={() => toast.error("Something went wrong. Please try again.", "Error")}>Error</Button>
          <Button variant="secondary" onClick={() => toast.warning("Check the amount before saving.", "Warning")}>Warning</Button>
          <Button variant="secondary" onClick={() => toast.info("Sync is in progress.", "Info")}>Info</Button>
          <Button variant="outline" onClick={() => toast.info("A long message that runs over several lines so you can check that the text wraps inside the toast and never pushes the close button out of view on a small phone screen.")}>Long text</Button>
        </div>
      </Block>

      <Block title="Modal, drawer and confirm" note="On a phone the modal becomes a bottom sheet">
        <div className="pv-row">
          <Button onClick={() => setModal(true)}>Open modal</Button>
          <Button variant="outline" onClick={() => setTall(true)}>Tall modal</Button>
          <Button variant="outline" onClick={() => setDrawer(true)}>Open drawer</Button>
          <Button variant="danger" onClick={() => setConfirm(true)}>Delete property</Button>
        </div>
      </Block>

      <Modal
        isOpen={modal}
        onClose={() => setModal(false)}
        title="New complaint"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={() => { setModal(false); toast.success("Complaint submitted."); }}>Submit</Button>
          </>
        }
      >
        <div className="pv-stack">
          <Input label="Subject" placeholder="Leaking tap" required />
          <SelectInput label="Category" value="plumbing" onChange={() => {}} options={["plumbing", "electrical", "security", "other"]} />
          <TextArea label="Details" placeholder="Tell us what happened" />
        </div>
      </Modal>

      <Modal isOpen={tall} onClose={() => setTall(false)} title="A tall modal" size="sm" footer={<Button onClick={() => setTall(false)}>Done</Button>}>
        {Array.from({ length: 24 }, (_, i) => (
          <p key={i} className="pv-muted">Line {i + 1}: the body scrolls while the header and footer stay in place.</p>
        ))}
      </Modal>

      <Drawer isOpen={drawer} onClose={() => setDrawer(false)} title="Filters" footer={<Button onClick={() => setDrawer(false)}>Apply</Button>}>
        <div className="pv-stack">
          <SelectInput label="Status" value="all" onChange={() => {}} options={["all", "active", "overdue"]} />
          <Checkbox label="Only show vacant units" checked={false} onChange={() => {}} />
        </div>
      </Drawer>

      <ConfirmDialog
        isOpen={confirm}
        title="Delete this property?"
        message="This removes the property and its units. This cannot be undone."
        confirmLabel="Delete"
        onCancel={() => !busy && setConfirm(false)}
        onConfirm={runConfirm}
        loading={busy}
      />
    </>
  );
}

function LoadingSection() {
  return (
    <>
      <Block title="Spinners">
        <div className="pv-row">
          <Spinner size="sm" inline />
          <Spinner size="md" inline />
          <Spinner size="lg" inline />
        </div>
      </Block>
      <Block title="Skeletons" note="Placeholders that hold the layout while data loads">
        <div className="pv-stack">
          <div className="pv-row">
            <Skeleton shape="circle" width={40} />
            <Skeleton width="40%" height={16} />
          </div>
          <SkeletonCard hasImage lines={3} />
          <SkeletonTable rows={4} cols={4} />
        </div>
      </Block>
      <Block title="Empty state">
        <EmptyState
          icon="payments"
          title="No payments yet"
          description="Payments will appear here once residents start paying rent."
          action={<Button leftIcon={<Icon name="plus" size={18} />}>Record a payment</Button>}
        />
      </Block>
    </>
  );
}

const TOKEN_GROUPS = [
  { title: "Surfaces", names: ["--color-bg", "--color-surface", "--color-surface-2", "--color-border", "--color-border-strong", "--color-control-border"] },
  { title: "Text", names: ["--color-text", "--color-text-muted", "--color-text-subtle", "--color-text-disabled"] },
  { title: "Brand and actions", names: ["--color-primary", "--color-primary-soft", "--color-action", "--color-action-hover", "--color-secondary-bg", "--color-danger-action", "--color-focus"] },
  { title: "Status", names: ["--color-success", "--color-success-bg", "--color-warning", "--color-warning-bg", "--color-error", "--color-error-bg", "--color-info", "--color-info-bg"] },
  { title: "Navigation", names: ["--color-nav-bg", "--color-nav-hover-bg", "--color-nav-active-bg", "--color-nav-text", "--color-nav-text-muted"] },
  { title: "Charts", names: ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"] },
];

function TokensSection() {
  return (
    <>
      {TOKEN_GROUPS.map((group) => (
        <Block key={group.title} title={group.title}>
          <div className="pv-swatches">
            {group.names.map((name) => (
              <div key={name} className="pv-swatch">
                <span className="pv-swatch__chip" style={{ background: `var(${name})` }} />
                <code className="pv-swatch__name">{name}</code>
              </div>
            ))}
          </div>
        </Block>
      ))}
    </>
  );
}

function IconsSection() {
  return (
    <Block title="Icons" note={`${ICON_NAMES.length} icons. Use <Icon name="…" />`}>
      <div className="pv-icons">
        {ICON_NAMES.map((name) => (
          <div key={name} className="pv-icon">
            <Icon name={name} size={24} />
            <code>{name}</code>
          </div>
        ))}
      </div>
    </Block>
  );
}

function ShellNotesSection() {
  return (
    <Block title="Shell notes" note="What to check on each screen size">
      <ul className="pv-list">
        <li>Under 768px: top bar, bottom tabs (four plus "More"), content full width.</li>
        <li>768 to 1023px: icon-only sidebar rail.</li>
        <li>1024px and up: full sidebar with the business at the bottom.</li>
        <li>Try the avatar menu: theme switch, help link and the dummy sign out.</li>
        <li>Tab through the page with the keyboard. The first Tab shows "Skip to content".</li>
        <li>Switch theme with the sun/moon button, then reload: the choice is remembered.</li>
      </ul>
    </Block>
  );
}

const SECTIONS = {
  components: ComponentsSection,
  forms: FormsSection,
  feedback: FeedbackSection,
  loading: LoadingSection,
  tokens: TokensSection,
  icons: IconsSection,
  shell: ShellNotesSection,
};

/** The page body for /preview/:section */
export function PreviewSection() {
  const { section } = useParams();
  const Section = SECTIONS[section];

  if (!Section) {
    return (
      <EmptyState
        icon="search"
        title="No such preview"
        description="Pick one from the menu."
        action={<Button as={Link} to="/preview/components">Go to Components</Button>}
      />
    );
  }

  return <div className="pv-page"><Section /></div>;
}