// src/components/ui/ImageUploadButton.jsx — NEW FILE (Part 8: live upload percent; exports UploadProgress)
//
// AIM
// The one "choose a photo" button for the smart upload. It replaces a plain file input: the person
// picks a photo, the crop window (ImageCropper) opens so they can frame it, pick JPEG, PNG or WebP,
// and confirm, and only then is the finished File given to the page, which uploads it as before.
// It draws as a <label>, so each page keeps its own button look by passing its own className.
//
// PROPS
//   preset      "hero" | "cover" | "product" | "room"   what shape to crop to (see lib/imagePipeline.js)
//   onFiles     (files: File[]) => void | Promise         the cropped photos, in the order chosen. When it returns a
//                                                        promise (an async handler) the live upload percent is shown
//                                                        under the button until it settles (lib/storage.js reports it)
//   children    the button text (e.g. "Replace photo")
//   className   the page's own button class (default: none)
//   disabled    true while the page is busy or the limit is reached
//   multiple    allow choosing several photos; each is framed in turn ("2 of 3")
//   maxFiles    most photos that may be chosen at once; more than this is refused BEFORE any framing starts
//   ariaLabel   label for the hidden file input
//   showProgress  show the live percent while an async onFiles runs (default true; PhotoUploader draws its own per file)
//
// Cancel while framing stops the rest of the queue and still hands over the photos already done.
//
// UploadProgress (named export, also used by PhotoUploader): one row "Uploading   65%" with a bar.
//   percent  number 0..100, or null when unknown (Supabase storage): shows "Uploading…" and a moving bar, no number
//   name     optional file name shown before the label
//   status   "queued" | "uploading" (default) | "done" | "error" | "cancelled"
//   error    message for status "error"
//   onCancel / onRetry   optional; show a cancel (X) or retry button, 44px touch targets

import "./ImageCropper.css";
import { useRef, useState, useSyncExternalStore } from "react";
import ImageCropper from "./ImageCropper.jsx";
import Icon from "./Icon.jsx";
import { RetryIcon, UploadIcon } from "./icons/ActivityIcons.jsx";
import { looksLikeImage } from "../../lib/imagePipeline.js";
import { getUploadSnapshot, subscribeUploads } from "../../lib/storage.js";

const STATUS_TEXT = { queued: "Waiting", done: "Uploaded", cancelled: "Cancelled" };

export function UploadProgress({ percent = null, name = "", status = "uploading", error = "", onCancel, onRetry }) {
  const known = typeof percent === "number";
  const active = status === "uploading";
  const shownPercent = status === "done" ? 100 : status === "queued" || status === "cancelled" || status === "error" ? 0 : known ? percent : null;
  const label = status === "error" ? error || "Upload failed." : active ? (known ? "Uploading" : "Uploading…") : STATUS_TEXT[status];
  const what = name ? ` ${name}` : "";
  return (
    <div className={`imgup-prog${status === "error" ? " imgup-prog--error" : ""}${active && !known ? " imgup-prog--wait" : ""}`}>
      <div className="imgup-prog__row">
        <UploadIcon size={16} className="imgup-prog__icon" />
        {name && <span className="imgup-prog__name">{name}</span>}
        <span className="imgup-prog__label" role={status === "error" ? "alert" : undefined}>{label}</span>
        {active && known && <span className="imgup-prog__pct">{percent}%</span>}
        {onRetry && (status === "error" || status === "cancelled") && (
          <button type="button" className="imgup-prog__btn" onClick={onRetry} aria-label={`Retry upload${what}`}><RetryIcon size={18} /></button>
        )}
        {onCancel && (
          <button type="button" className="imgup-prog__btn" onClick={onCancel} aria-label={status === "uploading" || status === "queued" ? `Cancel upload${what}` : `Dismiss${what}`}><Icon name="x" size={18} /></button>
        )}
      </div>
      <div
        className="imgup-prog__track"
        role="progressbar"
        aria-label={`Upload${what}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={active && !known ? undefined : shownPercent}
        aria-valuetext={active && !known ? "Uploading" : status === "error" ? "Failed" : `${shownPercent}%`}
      >
        <span className="imgup-prog__bar" style={active && !known ? undefined : { width: `${shownPercent}%` }} />
      </div>
    </div>
  );
}

export default function ImageUploadButton({ preset, onFiles, children, className = "", disabled = false, multiple = false, maxFiles = Infinity, ariaLabel = "Choose a photo", showProgress = true }) {
  const [queue, setQueue] = useState([]);
  const [pos, setPos] = useState(0);
  const [error, setError] = useState("");
  const done = useRef([]);
  const [waiting, setWaiting] = useState(false);
  const activity = useSyncExternalStore(subscribeUploads, getUploadSnapshot);

  function onPick(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = ""; // so choosing the same photo again still counts
    if (!picked.length) return;
    const pictures = picked.filter(looksLikeImage);
    setError(pictures.length < picked.length ? "Please choose picture files, such as JPG, PNG or WebP." : "");
    if (!pictures.length) return;
    if (pictures.length > maxFiles) {
      setError(maxFiles > 0 ? `You can add ${maxFiles} more photo${maxFiles === 1 ? "" : "s"}.` : "No more photos can be added.");
      return;
    }
    done.current = [];
    setPos(0);
    setQueue(pictures);
  }

  function finish() {
    const files = done.current;
    done.current = [];
    setQueue([]);
    setPos(0);
    if (files.length) {
      const result = onFiles(files);
      if (result && typeof result.then === "function") {
        setWaiting(true);
        Promise.resolve(result).then(() => setWaiting(false), () => setWaiting(false));
      }
    }
  }

  function onDone(file) {
    done.current.push(file);
    if (pos + 1 < queue.length) setPos(pos + 1);
    else finish();
  }

  return (
    <>
      <label className={className}>
        {children}
        <input type="file" accept="image/*" multiple={multiple} disabled={disabled} onChange={onPick} aria-label={ariaLabel} />
      </label>
      {error && <span className="imgup__error" role="alert">{error}</span>}
      {showProgress && waiting && activity.count > 0 && <UploadProgress percent={activity.percent} />}
      {queue.length > 0 && (
        <ImageCropper
          key={`${pos}-${queue[pos].name}-${queue[pos].size}`}
          file={queue[pos]}
          preset={preset}
          step={{ index: pos, total: queue.length }}
          onDone={onDone}
          onCancel={finish}
        />
      )}
    </>
  );
}
