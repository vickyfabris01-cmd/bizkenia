// src/components/feedback/ErrorBoundary.jsx — MODIFIED FILE (product name read from brand.js)
import { reportError } from "../../lib/monitor.js";
import { Component } from "react";
import { BRAND } from "../../config/brand.js";

// =============================================================================
// ErrorBoundary  — three variants, one file
//
// React class component — only class components can be error boundaries.
// Functional component wrappers provided for clean usage at each layer.
//
// Three exported boundaries:
//
//   <RootErrorBoundary>       — wraps the entire app in main.jsx
//                               Full-screen branded error page.
//                               Shows stack trace in development.
//
//   <PageErrorBoundary>       — wraps each route page in AppRouter.jsx
//                               Keeps sidebar/topbar alive.
//                               "Reload this page" + "Go home" buttons.
//
//   <WidgetErrorBoundary>     — wraps individual cards, charts, tables
//                               Inline error — rest of page still works.
//                               Used for non-critical UI sections.
//
// Usage:
//   import { RootErrorBoundary, PageErrorBoundary, WidgetErrorBoundary }
//     from "../components/feedback/ErrorBoundary.jsx";
//
//   <PageErrorBoundary route="/manage/billing">
//     <BillingPage />
//   </PageErrorBoundary>
//
//   <WidgetErrorBoundary label="Revenue Chart">
//     <RevenueChart data={data} />
//   </WidgetErrorBoundary>
// =============================================================================

// ── Shared helpers ─────────────────────────────────────────────────────────
const isDev = import.meta.env.DEV;

const ACCENT   = "#C5612C";
const CHARCOAL = "#1A1412";
const OFF_WHITE= "#FAF7F2";
const MUTED    = "#5C4A3A";
const BORDER   = "#EDE4D8";

function HomeButton({ href = "/", label = "Go to home" }) {
  return (
    <a href={href}
      style={{
        display:        "inline-flex",
        alignItems:     "center",
        gap:            6,
        padding:        "10px 20px",
        borderRadius:   10,
        background:     ACCENT,
        color:          "#fff",
        fontSize:       13,
        fontWeight:     700,
        textDecoration: "none",
        fontFamily:     "Inter, system-ui, sans-serif",
        transition:     "background 0.15s",
      }}
      onMouseOver={e => e.currentTarget.style.background = "#A84E22"}
      onMouseOut={e  => e.currentTarget.style.background = ACCENT}
    >
      {label}
    </a>
  );
}

function ReloadButton() {
  return (
    <button
      onClick={() => window.location.reload()}
      style={{
        display:      "inline-flex",
        alignItems:   "center",
        gap:          6,
        padding:      "10px 20px",
        borderRadius: 10,
        background:   "#fff",
        color:        CHARCOAL,
        fontSize:     13,
        fontWeight:   600,
        border:       `1.5px solid ${BORDER}`,
        cursor:       "pointer",
        fontFamily:   "Inter, system-ui, sans-serif",
        transition:   "border-color 0.15s",
      }}
      onMouseOver={e => e.currentTarget.style.borderColor = ACCENT}
      onMouseOut={e  => e.currentTarget.style.borderColor = BORDER}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M23 4v6h-6M1 20v-6h6"/>
        <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
      </svg>
      Reload page
    </button>
  );
}

function ErrorIcon({ size = 48, color = ACCENT }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  );
}

// ── Dev-only stack trace panel ────────────────────────────────────────────
function DevTrace({ error, info }) {
  if (!isDev || !error) return null;
  return (
    <details
      style={{
        marginTop:    20,
        background:   "#1E1E1E",
        borderRadius: 10,
        overflow:     "hidden",
        maxWidth:     700,
        width:        "100%",
        textAlign:    "left",
      }}
    >
      <summary style={{
        padding:    "10px 16px",
        fontSize:   12,
        fontWeight: 600,
        color:      "#9CA3AF",
        cursor:     "pointer",
        fontFamily: "monospace",
        userSelect: "none",
        listStyle:  "none",
        display:    "flex",
        alignItems: "center",
        gap:        8,
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="#F59E0B" strokeWidth="2" strokeLinecap="round">
          <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        </svg>
        DEV — Stack trace (hidden in production)
      </summary>
      <pre style={{
        padding:    "12px 16px",
        fontSize:   11,
        lineHeight: 1.6,
        color:      "#E5E7EB",
        overflow:   "auto",
        maxHeight:  320,
        margin:     0,
        fontFamily: "'Fira Code', 'Courier New', monospace",
        whiteSpace: "pre-wrap",
        wordBreak:  "break-word",
      }}>
        {error?.toString()}
        {"\n\n"}
        {info?.componentStack}
      </pre>
    </details>
  );
}

// =============================================================================
// 1. ROOT ERROR BOUNDARY — full screen, wraps entire app
// =============================================================================
class RootBoundaryClass extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    reportError(error, info?.componentStack);
    // Log to console with context
    console.group(`🔴 [${BRAND.name}] Root Error Boundary caught:`);
    console.error("Error:", error);
    console.error("Component stack:", info?.componentStack);
    console.groupEnd();
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, info: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight:      "100dvh",
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        background:     OFF_WHITE,
        fontFamily:     "Inter, system-ui, sans-serif",
        padding:        "32px 24px",
        textAlign:      "center",
      }}>
        {/* Logo mark */}
        <div style={{
          width:          56,
          height:         56,
          borderRadius:   16,
          background:     "linear-gradient(135deg, #C5612C, #8B3A18)",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          marginBottom:   24,
        }}>
          <svg viewBox="0 0 24 24" fill="white" width="26" height="26">
            <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/>
          </svg>
        </div>

        <ErrorIcon size={44} color="#EF4444" />

        <h1 style={{
          fontFamily:   "'Playfair Display', Georgia, serif",
          fontWeight:   900,
          fontSize:     "clamp(24px, 4vw, 36px)",
          color:        CHARCOAL,
          margin:       "20px 0 10px",
          lineHeight:   1.1,
        }}>
          Something went wrong
        </h1>

        <p style={{
          fontSize:   15,
          color:      MUTED,
          lineHeight: 1.7,
          maxWidth:   460,
          margin:     "0 0 32px",
        }}>
          {BRAND.name} hit an unexpected error. Your data is safe —
          this is a display issue only. Try reloading or returning home.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <ReloadButton />
          <HomeButton href="/" label="Return to home" />
        </div>

        <DevTrace error={this.state.error} info={this.state.info} />

        <p style={{ fontSize: 11, color: "#8B7355", marginTop: 32 }}>
          Error ID: {Date.now().toString(36).toUpperCase()} ·{" "}
          {isDev ? "Development mode" : "If this persists, contact support"}
        </p>
      </div>
    );
  }
}

// =============================================================================
// 2. PAGE ERROR BOUNDARY — keeps layout shell alive, replaces page content
// =============================================================================
class PageBoundaryClass extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    reportError(error, info?.componentStack);
    console.group(`🟠 [${BRAND.name}] Page Error Boundary — ${this.props.route ?? "unknown"}`);
    console.error("Error:", error);
    console.error("Component stack:", info?.componentStack);
    console.groupEnd();
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, info: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const routeLabel = this.props.route ?? "this page";

    return (
      <div style={{
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        minHeight:      "60vh",
        padding:        "40px 24px",
        textAlign:      "center",
        fontFamily:     "Inter, system-ui, sans-serif",
      }}>
        {/* Error illustration */}
        <div style={{
          width:          72,
          height:         72,
          borderRadius:   20,
          background:     "#FEF2F2",
          border:         "2px solid #FECACA",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          marginBottom:   20,
        }}>
          <ErrorIcon size={36} color="#EF4444" />
        </div>

        <h2 style={{
          fontFamily:   "'Playfair Display', Georgia, serif",
          fontWeight:   900,
          fontSize:     24,
          color:        CHARCOAL,
          margin:       "0 0 10px",
        }}>
          Page crashed
        </h2>

        <p style={{
          fontSize:   14,
          color:      MUTED,
          lineHeight: 1.65,
          maxWidth:   420,
          margin:     "0 0 28px",
        }}>
          An error occurred while loading <strong>{routeLabel}</strong>.
          Your other pages and data are unaffected.
          {isDev && this.state.error && (
            <>
              {" "}
              <span style={{ color: "#EF4444", fontWeight: 600 }}>
                {this.state.error.message}
              </span>
            </>
          )}
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <button
            onClick={this.handleReset}
            style={{
              padding:      "10px 20px",
              borderRadius: 10,
              background:   ACCENT,
              color:        "#fff",
              fontSize:     13,
              fontWeight:   700,
              border:       "none",
              cursor:       "pointer",
              fontFamily:   "Inter, system-ui, sans-serif",
            }}
          >
            Try again
          </button>
          <ReloadButton />
          <HomeButton href="/" label="Home" />
        </div>

        <DevTrace error={this.state.error} info={this.state.info} />
      </div>
    );
  }
}

// =============================================================================
// 3. WIDGET ERROR BOUNDARY — inline, for charts, cards, tables
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
    console.warn(
      `🟡 [${BRAND.name}] Widget Error Boundary — ${this.props.label ?? "widget"}:`,
      error.message
    );
    if (isDev) console.error(info?.componentStack);
  }

  handleReset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;

    const label = this.props.label ?? "This section";

    return (
      <div style={{
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        gap:            10,
        padding:        this.props.compact ? "20px 16px" : "32px 24px",
        border:         `1px dashed #FECACA`,
        borderRadius:   16,
        background:     "#FFF5F5",
        textAlign:      "center",
        fontFamily:     "Inter, system-ui, sans-serif",
        minHeight:      this.props.minHeight ?? 120,
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="#EF4444" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p style={{
          fontSize:   13,
          color:      "#991B1B",
          margin:     0,
          fontWeight: 600,
        }}>
          {label} failed to load
        </p>
        {isDev && this.state.error && (
          <p style={{ fontSize: 11, color: "#B91C1C", margin: 0, fontFamily: "monospace" }}>
            {this.state.error.message}
          </p>
        )}
        <button
          onClick={this.handleReset}
          style={{
            fontSize:     11,
            color:        ACCENT,
            fontWeight:   600,
            background:   "none",
            border:       "none",
            cursor:       "pointer",
            padding:      "3px 8px",
            borderRadius: 6,
            fontFamily:   "Inter, system-ui, sans-serif",
          }}
        >
          Retry
        </button>
      </div>
    );
  }
}

// =============================================================================
// Public functional wrappers — clean JSX at usage sites
// =============================================================================

export function RootErrorBoundary({ children }) {
  return <RootBoundaryClass>{children}</RootBoundaryClass>;
}

export function PageErrorBoundary({ children, route }) {
  return (
    <PageBoundaryClass route={route}>
      {children}
    </PageBoundaryClass>
  );
}

export function WidgetErrorBoundary({ children, label, compact, minHeight }) {
  return (
    <WidgetBoundaryClass label={label} compact={compact} minHeight={minHeight}>
      {children}
    </WidgetBoundaryClass>
  );
}

// Default export for convenience
export default RootErrorBoundary;