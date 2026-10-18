// src/components/modals/Modal.jsx — MODIFIED FILE (rebuilt on design tokens; same props as before)
//
// AIM
// The three overlay pieces every dialog in the app is built from:
//   Modal          a centred dialog (a bottom sheet on phones)
//   Drawer         a panel that slides in from the right or left
//   ConfirmDialog  a small "Are you sure?" dialog for risky actions
//
// WHAT IS NEW (props are unchanged, so every existing modal keeps working)
//   - Tab and Shift+Tab stay inside the open dialog (focus trap) and focus goes back to the
//     button that opened it when it closes.
//   - Each dialog has its own id for its title (the old one used one fixed id for all).
//   - Scroll lock counts open dialogs, so a ConfirmDialog opened on top of a Modal no longer
//     unlocks the page when it closes.
//   - Colours, corners and shadows come from tokens, so light and dark mode both work.
//   - On phones a Modal is a bottom sheet: easier to reach with a thumb.
//
// MODAL PROPS
//   isOpen, onClose, title, children, footer
//   size        "sm"(400) | "md"(560) | "lg"(720) | "xl"(900) | "full"
//   closable    show the X button and allow Escape / backdrop click (default true)
//   scrollable  let the body scroll when tall (default true)
//   Put data-autofocus on an element in the body to choose what gets focus on open.
//
// USAGE
//   <Modal isOpen={open} onClose={close} title="New complaint" size="md"
//          footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button>Submit</Button></>}>
//     <NewComplaintForm />
//   </Modal>

import { useCallback, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import Button from "../ui/Button.jsx";
import Icon from "../ui/Icon.jsx";
import "./Modal.css";

// ─── Scroll lock that survives nested dialogs ────────────────────────────────
let lockCount = 0;
let previousOverflow = "";

function useLockScroll(active) {
  useEffect(() => {
    if (!active) return undefined;
    if (lockCount === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    lockCount += 1;
    return () => {
      lockCount -= 1;
      if (lockCount === 0) document.body.style.overflow = previousOverflow;
    };
  }, [active]);
}

// ─── Focus trap: keep Tab inside, restore focus on close ─────────────────────
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useFocusTrap(panelRef, active) {
  useEffect(() => {
    if (!active) return undefined;
    const panel = panelRef.current;
    if (!panel) return undefined;

    const opener = document.activeElement;

    // Choose what gets focus: [data-autofocus], else the first field/button in the body,
    // else the first focusable thing (the close button), else the panel itself.
    const preferred =
      panel.querySelector("[data-autofocus]") ||
      panel.querySelector(
        `.ui-overlay__body :is(input, select, textarea, button, a[href]):not([disabled])`,
      ) ||
      panel.querySelector(FOCUSABLE) ||
      panel;
    requestAnimationFrame(() => preferred.focus?.({ preventScroll: true }));

    const onKeyDown = (event) => {
      if (event.key !== "Tab") return;
      const items = Array.from(panel.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener("keydown", onKeyDown);
    return () => {
      panel.removeEventListener("keydown", onKeyDown);
      if (opener && typeof opener.focus === "function" && document.contains(opener)) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [active, panelRef]);
}

// ─── Layer: portal + backdrop + Escape + scroll lock + focus trap ────────────
function Layer({
  isOpen,
  onClose,
  closable = true,
  role = "dialog",
  labelledBy,
  layerClass = "",
  panelClass = "",
  children,
}) {
  const panelRef = useRef(null);
  const pressStartedOnBackdrop = useRef(false);

  useLockScroll(isOpen);
  useFocusTrap(panelRef, isOpen);

  useEffect(() => {
    if (!isOpen || !closable) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, closable, onClose]);

  // Close on backdrop click only when the press also STARTED on the backdrop, so dragging
  // a text selection out of an input does not close the dialog by accident.
  const onBackdropDown = useCallback((event) => {
    pressStartedOnBackdrop.current = event.target === event.currentTarget;
  }, []);
  const onBackdropClick = useCallback(
    (event) => {
      if (closable && pressStartedOnBackdrop.current && event.target === event.currentTarget) {
        onClose?.();
      }
      pressStartedOnBackdrop.current = false;
    },
    [closable, onClose],
  );

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`ui-overlay ${layerClass}`.trim()}
      onMouseDown={onBackdropDown}
      onClick={onBackdropClick}
    >
      <div
        ref={panelRef}
        className={panelClass}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

function CloseButton({ onClick }) {
  return (
    <button type="button" className="ui-overlay__close" onClick={onClick} aria-label="Close">
      <Icon name="x" size={20} />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────────────────────────────────────
const SIZES = ["sm", "md", "lg", "xl", "full"];

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = "md",
  closable = true,
  scrollable = true,
}) {
  const titleId = useId();
  const s = SIZES.includes(size) ? size : "md";

  return (
    <Layer
      isOpen={isOpen}
      onClose={onClose}
      closable={closable}
      labelledBy={title ? titleId : undefined}
      layerClass="ui-overlay--center"
      panelClass={`ui-modal ui-modal--${s}`}
    >
      {(title || closable) && (
        <div className="ui-overlay__header">
          {title && (
            <h2 id={titleId} className="ui-overlay__title">
              {title}
            </h2>
          )}
          {closable && <CloseButton onClick={onClose} />}
        </div>
      )}

      <div className={`ui-overlay__body${scrollable ? " is-scrollable" : ""}`}>{children}</div>

      {footer && <div className="ui-overlay__footer">{footer}</div>}
    </Layer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Drawer — slides in from the right (default) or left.
//   width   maximum width in pixels (default 400); never wider than the screen
// ─────────────────────────────────────────────────────────────────────────────
export function Drawer({ isOpen, onClose, title, children, footer, side = "right", width = 400 }) {
  const titleId = useId();
  const edge = side === "left" ? "left" : "right";

  return (
    <Layer
      isOpen={isOpen}
      onClose={onClose}
      labelledBy={title ? titleId : undefined}
      layerClass={`ui-overlay--${edge}`}
      panelClass={`ui-drawer ui-drawer--${edge}`}
    >
      <div className="ui-drawer__inner" style={{ "--drawer-width": `${width}px` }}>
        <div className="ui-overlay__header">
          {title && (
            <h2 id={titleId} className="ui-overlay__title">
              {title}
            </h2>
          )}
          <CloseButton onClick={onClose} />
        </div>
        <div className="ui-overlay__body is-scrollable">{children}</div>
        {footer && <div className="ui-overlay__footer">{footer}</div>}
      </div>
    </Layer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ConfirmDialog — lightweight confirmation for risky actions.
//   title, message, confirmLabel, cancelLabel, onConfirm, onCancel
//   variant   "danger" (default) | "warning" | "info"
//   loading   disables the confirm button and shows a spinner while the action runs
// ─────────────────────────────────────────────────────────────────────────────
const CONFIRM_ICON = { danger: "warning", warning: "warning", info: "info" };

export function ConfirmDialog({
  isOpen,
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
  loading = false,
}) {
  const titleId = useId();
  const v = CONFIRM_ICON[variant] ? variant : "danger";

  return (
    <Layer
      isOpen={isOpen}
      onClose={onCancel}
      role="alertdialog"
      labelledBy={titleId}
      layerClass="ui-overlay--center ui-overlay--top"
      panelClass="ui-modal ui-modal--confirm"
    >
      <div className="ui-confirm">
        <span className={`ui-confirm__icon ui-confirm__icon--${v}`}>
          <Icon name={CONFIRM_ICON[v]} size={24} />
        </span>
        <h2 id={titleId} className="ui-confirm__title">
          {title}
        </h2>
        {message && <div className="ui-confirm__message">{message}</div>}
        <div className="ui-confirm__actions">
          <Button variant="secondary" onClick={onCancel} data-autofocus>
            {cancelLabel}
          </Button>
          <Button variant={v === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Layer>
  );
}

export default Modal;