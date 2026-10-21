// src/components/feedback/ErrorBoundary.jsx — MODIFIED (rebuilt on the current theme, logo and wording)
//
// AIM
// What a person sees when something in the app crashes, instead of a blank page. Three levels:
//   <RootErrorBoundary>   wraps the whole app (main.jsx). A full-screen card with the BizKenia logo.
//                         Only used for crashes that escape every page.
//   <PageErrorBoundary>   wraps each page (AppRouter.jsx). Keeps the header and footer working and
//                         replaces just the page with a card: Try again / Reload / Home.
//   <WidgetErrorBoundary> wraps one chart, card or table. A small inline notice with Retry.
// All looks come from the theme tokens (ErrorBoundary.css), so light and dark mode work. No stores or
// hooks are used here on purpose: an error screen must keep working when the rest of the app does not.
// In development the real error message shows on the card and the stack trace sits in a closed panel.
// Each crash gets an Error ID (made once, when it happens) that support can ask for.
//
// USAGE
//   <PageErrorBoundary><BillingPage /></PageErrorBoundary>
//   <WidgetErrorBoundary label="Revenue chart"><RevenueChart /></WidgetErrorBoundary>

import "./ErrorBoundary.css";
import { Component } from "react";
import { reportError } from "../../lib/monitor.js";
import { BRAND } from "../../config/brand.js";
import logoSrc from "../../assets/bizkenia-logo.png";

const isDev = import.meta.env.DEV;

// A file of the app that could not load (usually right after an update, or a missing export in development).
const LOAD_FAILURE = /dynamically imported module|does not provide an export|Loading chunk|Importing a module script failed|error loading dynamically/i;
const isLoadFailure = (error) => LOAD_FAILURE.test(String(error?.message || error || ""));
const newErrorId = () => `${Math.random().toString(36).slice(2, 6)}${Date.now().toString(36).slice(-4)}`.toUpperCase();

function ErrorIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

const reload = () => window.location.reload();

/** Development only: the real message in plain sight, and the stack in a closed panel. */
function DevDetails({ error, info }) {
  if (!isDev || !error) return null;
  return (
    <div className="eb-dev">
      <p className="eb-dev__msg">{String(error.message || error)}</p>
      <details>
        <summary>Technical details (development only)</summary>
        <pre>{error.stack || String(error)}{info?.componentStack ? `\n\nComponent stack:${info.componentStack}` : ""}</pre>
      </details>
    </div>
  );
}

const loadHint = " A part of the app could not load. Reloading usually fixes this, especially right after an update.";

// =============================================================================
// 1. ROOT: full screen, wraps the whole app
// =============================================================================
class RootBoundaryClass extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null, id: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error, id: newErrorId() };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    reportError(error, info?.componentStack);
    console.group(`[${BRAND.name}] Root error boundary caught:`);
    console.error("Error:", error);
    console.error("Component stack:", info?.componentStack);
    console.groupEnd();
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    const { error, info, id } = this.state;
    return (
      <div className="eb-screen" role="alert">
        <div className="eb-card">
          <span className="eb-logo"><img src={logoSrc} alt={BRAND.name} /></span>
          <span className="eb-icon"><ErrorIcon /></span>
          <h1 className="eb-title">Something went wrong</h1>
          <p className="eb-text">
            {BRAND.name} could not show this page. Your data is safe and nothing was lost.
            {isLoadFailure(error) ? loadHint : " Try reloading, or go back to the home page."}
          </p>
          <div className="eb-actions">
            <button type="button" className="eb-btn eb-btn--primary" onClick={reload}>Reload page</button>
            <a className="eb-btn eb-btn--outline" href="/">Back to home</a>
          </div>
          <DevDetails error={error} info={info} />
          <p className="eb-meta">Error ID {id}{isDev ? " · development mode" : ". If it keeps happening, quote this ID to support."}</p>
        </div>
      </div>
    );
  }
}

// =============================================================================
// 2. PAGE: keeps the header and footer, replaces just the page
// =============================================================================
class PageBoundaryClass extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null, id: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error, id: newErrorId() };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    reportError(error, info?.componentStack);
    console.group(`[${BRAND.name}] Page error boundary: ${this.props.route ?? "unknown route"}`);
    console.error("Error:", error);
    console.error("Component stack:", info?.componentStack);
    console.groupEnd();
  }

  handleReset = () => this.setState({ hasError: false, error: null, info: null, id: "" });

  render() {
    if (!this.state.hasError) return this.props.children;
    const { error, info, id } = this.state;
    return (
      <div className="eb-page" role="alert">
        <div className="eb-card eb-card--flat">
          <span className="eb-icon"><ErrorIcon /></span>
          <h2 className="eb-title">This page hit a problem</h2>
          <p className="eb-text">
            The rest of the site still works and your data is safe.
            {isLoadFailure(error) ? loadHint : " Try again, or reload the page."}
          </p>
          <div className="eb-actions">
            <button type="button" className="eb-btn eb-btn--primary" onClick={this.handleReset}>Try again</button>
            <button type="button" className="eb-btn eb-btn--outline" onClick={reload}>Reload page</button>
            <a className="eb-btn eb-btn--outline" href="/">Home</a>
          </div>
          <DevDetails error={error} info={info} />
          <p className="eb-meta">Error ID {id}</p>
        </div>
      </div>
    );
  }
}

// =============================================================================
// 3. WIDGET: a small inline notice for one chart, card or table
// =============================================================================
class WidgetBoundaryClass extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.warn(`[${BRAND.name}] Widget error boundary: ${this.props.label ?? "widget"}:`, error.message);
    if (isDev) console.error(info?.componentStack);
  }

  handleReset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    const label = this.props.label ?? "This section";
    return (
      <div className={`eb-widget${this.props.compact ? " eb-widget--compact" : ""}`} role="alert"
        style={this.props.minHeight ? { minHeight: this.props.minHeight } : undefined}>
        <ErrorIcon size={20} />
        <p className="eb-widget__label">{label} could not load</p>
        {isDev && this.state.error && <p className="eb-widget__msg">{this.state.error.message}</p>}
        <button type="button" onClick={this.handleReset}>Retry</button>
      </div>
    );
  }
}

// =============================================================================
// Public wrappers
// =============================================================================
export function RootErrorBoundary({ children }) {
  return <RootBoundaryClass>{children}</RootBoundaryClass>;
}

export function PageErrorBoundary({ children, route }) {
  return <PageBoundaryClass route={route}>{children}</PageBoundaryClass>;
}

export function WidgetErrorBoundary({ children, label, compact, minHeight }) {
  return <WidgetBoundaryClass label={label} compact={compact} minHeight={minHeight}>{children}</WidgetBoundaryClass>;
}

export default RootErrorBoundary;